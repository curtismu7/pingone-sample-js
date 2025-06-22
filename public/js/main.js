// Main page functionality for Ping Identity User Management
// This file handles all user operations: import, modify, delete
// Debugging: Check browser console for detailed operation logs

class MainPage {
    constructor() {
        // State management for file operations
        this.currentFile = null;        // Currently selected file object
        this.currentFileInfo = null;    // Metadata about current file (name, size, records)
        
        // Operation flags to prevent concurrent operations
        this.importInProgress = false;  // DEBUG: Check this flag if operations seem stuck
        this.modifyInProgress = false;
        this.deleteInProgress = false;
        
        // Results and pagination state
        this.resultsData = [];          // Stores operation results for display
        this.currentPage = 1;           // Current pagination page
        this.recordsPerPage = 25;       // Results per page
        
        this.init();
    }

    async init() {
        // DEBUG: If page doesn't load properly, check if utils is available
        await this.waitForUtils();
        this.setupEventListeners();
        this.loadPersistedState();
        this.initializeTooltips();
        utils.log('Main page initialized', 'info');
    }

    async waitForUtils() {
        // DEBUG: If this loops indefinitely, utils.js failed to load
        while (!window.utils) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    initializeTooltips() {
        // Initialize Tippy.js tooltips for all elements with data-tippy-content
        // DEBUG: If tooltips don't show, check if Tippy.js library loaded correctly
        const tooltipElements = document.querySelectorAll('[data-tippy-content]');
        tooltipElements.forEach(element => {
            tippy(element, {
                content: element.getAttribute('data-tippy-content'),
                placement: 'top',
                arrow: true,
                theme: 'light',
                animation: 'scale',
                duration: [200, 150]
            });
        });
    }

    setupEventListeners() {
        // File and import listeners
        // DEBUG: If file selection doesn't work, check if elements exist in DOM
        document.getElementById('csv-file')?.addEventListener('change', (e) => this.handleFileSelect(e));
        document.getElementById('import-btn')?.addEventListener('click', () => this.importUsers());

        // Modify user listeners
        document.getElementById('modify-btn')?.addEventListener('click', () => this.modifyUsers());

        // Delete user listeners
        document.getElementById('delete-btn')?.addEventListener('click', () => this.deleteUsers());
        document.getElementById('delete-username-btn')?.addEventListener('click', () => this.deleteUserByUsername());

        // Sidebar Quick Actions
        this.setupSidebarNavigation();

        // Mobile menu toggle
        this.setupMobileMenu();

        // Quick action navigation
        document.querySelectorAll('.quick-action').forEach(action => {
            action.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleQuickAction(e.currentTarget);
            });
        });

        // Export results
        document.getElementById('export-results')?.addEventListener('click', () => this.exportResults());
    }

    setupSidebarNavigation() {
        // Quick Actions dropdown toggle
        // DEBUG: If sidebar doesn't expand, check CSS classes and element IDs
        const quickActionsToggle = document.getElementById('quick-actions-toggle');
        if (quickActionsToggle) {
            quickActionsToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleQuickActions();
            });
        }

        // Sidebar hover behavior for expansion
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseenter', () => {
                sidebar.classList.add('expanded');
            });
            
            sidebar.addEventListener('mouseleave', () => {
                sidebar.classList.remove('expanded');
            });
        }
    }

    setupMobileMenu() {
        // Mobile responsive menu handling
        // DEBUG: If mobile menu doesn't work, check viewport width detection
        const mobileToggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        if (mobileToggle && sidebar && overlay) {
            // Toggle menu on button click
            mobileToggle.addEventListener('click', () => {
                this.toggleMobileMenu();
            });

            // Close menu when overlay is clicked
            overlay.addEventListener('click', () => {
                this.closeMobileMenu();
            });

            // Close menu when navigation link is clicked (mobile)
            const navLinks = sidebar.querySelectorAll('.nav-link, .nav-submenu-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    // Only close on mobile
                    if (window.innerWidth <= 768) {
                        this.closeMobileMenu();
                    }
                });
            });
        }
    }

    toggleMobileMenu() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (sidebar && overlay) {
            const isOpen = sidebar.classList.contains('open');
            
            if (isOpen) {
                this.closeMobileMenu();
            } else {
                this.openMobileMenu();
            }
        }
    }

    openMobileMenu() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (sidebar && overlay) {
            sidebar.classList.add('open');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    }

    closeMobileMenu() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (sidebar && overlay) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }

    toggleQuickActions() {
        const dropdown = document.querySelector('.nav-dropdown');
        const submenu = document.querySelector('.nav-submenu');
        
        if (dropdown && submenu) {
            const isOpen = dropdown.classList.contains('open');
            
            if (isOpen) {
                dropdown.classList.remove('open');
                submenu.classList.remove('show');
            } else {
                dropdown.classList.add('open');
                submenu.classList.add('show');
            }
        }
    }

    handleQuickAction(actionElement) {
        // Handle sidebar quick action navigation
        // DEBUG: If navigation doesn't work, check data-action attributes and href values
        const action = actionElement.getAttribute('data-action');
        const targetId = actionElement.getAttribute('href');
        
        // Remove active class from all quick actions
        document.querySelectorAll('.quick-action').forEach(el => {
            el.classList.remove('active');
        });
        
        // Add active class to clicked action
        actionElement.classList.add('active');
        
        // Navigate to the target panel
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Handle specific actions
            switch (action) {
                case 'delete-single':
                    // Focus on the username input for delete single user
                    const usernameInput = document.getElementById('delete-username');
                    if (usernameInput) {
                        setTimeout(() => usernameInput.focus(), 500);
                    }
                    break;
                // Add more specific action handlers as needed
            }
        }
    }

    loadPersistedState() {
        // Load previously saved settings and file selections from localStorage
        // DEBUG: If state doesn't persist, check localStorage in browser dev tools
        try {
            const settings = utils.getSettings();
            if (settings) {
                utils.log('Settings loaded', 'info');
            }
            
            // Load any persisted file selection
            this.loadPersistedFileSelection();
        } catch (error) {
            console.error('Error loading persisted state:', error);
            utils.log('Error loading persisted state: ' + error.message, 'error');
        }
    }

    async loadEnvironmentInfo() {
        // Load PingOne environment information and display in UI
        // DEBUG: If environment info doesn't load, check PingOne API connectivity
        try {
            utils.showSpinner('Authenticating with PingOne API...');
            
            const envInfo = await utils.getEnvironmentInfo();
            if (envInfo && envInfo.success) {
                // Display environment information in the import section
                const envInfoElement = document.getElementById('environment-info');
                if (envInfoElement) {
                    envInfoElement.innerHTML = `
                        <div class="env-info-item">
                            <span class="label">Environment:</span>
                            <span class="value">${envInfo.data.name || 'Unknown'}</span>
                        </div>
                        <div class="env-info-item">
                            <span class="label">Environment ID:</span>
                            <span class="value">${envInfo.data.id || 'Unknown'}</span>
                        </div>
                        <div class="env-info-item">
                            <span class="label">Client ID:</span>
                            <span class="value">${envInfo.data.clientId || 'Unknown'}</span>
                        </div>
                    `;
                }
                utils.log('Environment info loaded successfully', 'info');
            } else {
                throw new Error(envInfo?.message || 'Failed to load environment info');
            }
        } catch (error) {
            console.error('Error loading environment info:', error);
            utils.log('Error loading environment info: ' + error.message, 'error');
        } finally {
            utils.hideSpinner();
        }
    }

    loadPersistedFileSelection() {
        // Restore previously selected file information from localStorage
        // DEBUG: Check localStorage for 'currentFileInfo' key
        try {
            const savedFileInfo = localStorage.getItem('currentFileInfo');
            if (savedFileInfo) {
                this.currentFileInfo = JSON.parse(savedFileInfo);
                this.displayCurrentFileStatus(this.currentFileInfo, 'persisted-file-info');
                utils.log('File selection restored from previous session', 'info');
            }
        } catch (error) {
            console.error('Error loading persisted file selection:', error);
            localStorage.removeItem('currentFileInfo'); // Clear corrupted data
        }
    }

    async handleFileSelect(event) {
        // Handle CSV file selection and validation
        // DEBUG: If file processing fails, check file format and size
        const file = event.target.files[0];
        if (!file) {
            this.clearFileSelection();
            return;
        }

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.csv')) {
            utils.showModal('Error', 'Please select a CSV file.');
            this.clearFileSelection();
            return;
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            utils.showModal('Error', 'File size exceeds 10MB limit.');
            this.clearFileSelection();
            return;
        }

        try {
            utils.showSpinner('Analyzing CSV file...');
            
            // Read and parse CSV file
            const text = await this.readFileAsText(file);
            const parsedData = Papa.parse(text, { header: true, skipEmptyLines: true });
            
            if (parsedData.errors.length > 0) {
                console.warn('CSV parsing warnings:', parsedData.errors);
            }

            // Store file information
            this.currentFile = file;
            this.currentFileInfo = {
                name: file.name,
                size: file.size,
                records: parsedData.data.length,
                headers: parsedData.meta.fields || [],
                lastModified: new Date(file.lastModified).toLocaleString()
            };

            // Persist file info for page reloads
            localStorage.setItem('currentFileInfo', JSON.stringify(this.currentFileInfo));

            // Display file status
            this.displayCurrentFileStatus(this.currentFileInfo, 'selected-file-info');
            this.displayFileMetadata(parsedData.meta);
            
            utils.log(`Selected file: ${file.name} (${parsedData.data.length} records)`, 'info');
        } catch (error) {
            console.error('Error processing file:', error);
            utils.showModal('Error', `Failed to process file: ${error.message}`);
            this.clearFileSelection();
        } finally {
            utils.hideSpinner();
        }
    }

    displayCurrentFileStatus(fileInfo, sourceClass) {
        // Display current file information in the UI
        // DEBUG: If file info doesn't display, check if element exists and CSS classes
        const statusElement = document.getElementById('current-file-status');
        if (statusElement && fileInfo) {
            statusElement.innerHTML = `
                <div class="current-file-info ${sourceClass}">
                    <div class="file-info-header">
                        <strong>Current:</strong> 
                        <span class="filename">${fileInfo.name}</span>
                    </div>
                    <div class="file-details">
                        <span class="file-size">${this.formatFileSize(fileInfo.size)}</span>
                        <span class="record-count">${fileInfo.records} records</span>
                        <span class="file-date">Modified: ${fileInfo.lastModified}</span>
                    </div>
                </div>
            `;
            statusElement.style.display = 'block';
        }
    }

    formatFileSize(bytes) {
        // Convert bytes to human-readable format
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    displayFileMetadata(metadata) {
        // Display CSV metadata (headers, field count, etc.)
        // DEBUG: If metadata doesn't show, check Papa Parse output structure
        const metadataElement = document.getElementById('file-metadata');
        if (metadataElement && metadata.fields) {
            metadataElement.innerHTML = `
                <div class="metadata-section">
                    <h4>File Structure</h4>
                    <p><strong>Fields:</strong> ${metadata.fields.length}</p>
                    <p><strong>Headers:</strong> ${metadata.fields.join(', ')}</p>
                </div>
            `;
            metadataElement.style.display = 'block';
        }
    }

    clearFileSelection() {
        // Reset file selection state
        // DEBUG: Call this if you need to reset file state during testing
        this.currentFile = null;
        this.currentFileInfo = null;
        localStorage.removeItem('currentFileInfo');
        
        // Clear UI elements
        const fileInput = document.getElementById('csv-file');
        if (fileInput) fileInput.value = '';
        
        const statusElement = document.getElementById('current-file-status');
        if (statusElement) statusElement.style.display = 'none';
        
        this.clearFileMetadata();
        utils.log('File selection cleared', 'info');
    }

    clearFileMetadata() {
        // Clear file metadata display
        const metadataElement = document.getElementById('file-metadata');
        if (metadataElement) {
            metadataElement.style.display = 'none';
        }
    }

    updateOperationStatus(operation, status, results = null, error = null) {
        // Update operation status display in UI
        // DEBUG: Check this function if status indicators aren't updating
        const statusElement = document.getElementById(`${operation}-status`);
        if (!statusElement) return;

        let statusClass = '';
        let statusText = '';
        let detailsHtml = '';

        switch (status) {
            case 'in-progress':
                statusClass = 'status-in-progress';
                statusText = 'In Progress...';
                break;
            case 'completed':
                statusClass = 'status-success';
                statusText = 'Completed';
                if (results) {
                    const { successCount = 0, errorCount = 0 } = results;
                    detailsHtml = `
                        <div class="status-details">
                            <span class="success-count">✅ ${successCount} successful</span>
                            <span class="error-count">❌ ${errorCount} failed</span>
                        </div>
                    `;
                }
                break;
            case 'failed':
                statusClass = 'status-error';
                statusText = 'Failed – See Logs';
                if (error) {
                    detailsHtml = `
                        <div class="status-details">
                            <div class="error-summary">${error}</div>
                        </div>
                    `;
                }
                break;
            default:
                statusClass = '';
                statusText = 'Ready';
        }

        statusElement.innerHTML = `
            <div class="operation-status ${statusClass}">
                <span class="status-label">Status:</span>
                <span class="status-text">${statusText}</span>
                ${detailsHtml}
            </div>
        `;
    }

    async importUsers() {
        // Main import users function
        // DEBUG: If import fails, check file selection, credentials, and server logs
        if (this.importInProgress) {
            utils.showModal('Warning', 'Import operation already in progress.');
            return;
        }

        if (!this.currentFile) {
            utils.showModal('Warning', 'Please select a CSV file first.');
            return;
        }

        // Validate credentials before starting
        const settings = utils.getSettings();
        if (!settings || !settings.environmentId || !settings.clientId || !settings.clientSecret) {
            utils.showModal('Error', 'Please configure your PingOne credentials in Settings first.');
            return;
        }

        try {
            this.importInProgress = true;
            this.updateOperationStatus('import', 'in-progress');
            
            // Show operation spinner with file info
            utils.showOperationSpinner(`Starting Import Users (${this.currentFileInfo.records} records)...`, this.currentFileInfo.name);
            utils.log(`Import Users started – action: Import Users (${this.currentFileInfo.records} records) from ${this.currentFileInfo.name}`, 'info');

            // Start the workflow steps
            utils.startWorkflowSteps();

            // Get worker token
            utils.log('Getting worker token for import operation', 'info');
            const tokenResponse = await utils.getWorkerToken();
            
            if (!tokenResponse.success) {
                throw new Error(`Failed to get worker token: ${tokenResponse.message}`);
            }

            utils.updateTokenStep(tokenResponse.data.access_token, tokenResponse.data.expires_in);

            // Read and parse file
            const text = await this.readFileAsText(this.currentFile);
            const parsedData = Papa.parse(text, { header: true, skipEmptyLines: true });
            
            utils.addFileLoadingStep(this.currentFileInfo.name, parsedData.data.length);

            // Start processing
            utils.addProcessingStep();
            
            // Start progress simulation
            utils.startProgressSimulation(parsedData.data.length, 8000, this.currentFileInfo.name);
            
            // Process the import
            const results = await this.processImport(parsedData.data, {
                environmentId: settings.environmentId,
                clientId: settings.clientId,
                clientSecret: settings.clientSecret,
                accessToken: tokenResponse.data.access_token
            });

            // Complete the operation
            utils.addFinalizingStep(results.successCount, results.errorCount, 'Import');
            utils.completeOperationSpinner(results.successCount, results.errorCount);
            
            this.updateOperationStatus('import', 'completed', results);
            this.displayResults('Import Results', results.results);
            
            utils.log(`Imported ${results.successCount} users (${results.errorCount} failed) in ${results.duration}ms.`, 'info');
            utils.log(`Action complete – Import Users: ${results.successCount}, Failed: ${results.errorCount} ✅`, 'info');

        } catch (error) {
            console.error('Import operation failed:', error);
            utils.log(`Import operation failed: ${error.message}`, 'error');
            this.updateOperationStatus('import', 'failed', null, error.message);
            utils.failOperationSpinner('step-processing', error.message);
        } finally {
            this.importInProgress = false;
            // Auto-hide spinner after a delay to show completion
            setTimeout(() => utils.hideSpinner(), 2000);
        }
    }

    async modifyUsers() {
        // Main modify users function
        // DEBUG: Similar debugging approach as importUsers()
        if (this.modifyInProgress) {
            utils.showModal('Warning', 'Modify operation already in progress.');
            return;
        }

        if (!this.currentFile) {
            utils.showModal('Warning', 'Please select a CSV file first.');
            return;
        }

        const settings = utils.getSettings();
        if (!settings || !settings.environmentId || !settings.clientId || !settings.clientSecret) {
            utils.showModal('Error', 'Please configure your PingOne credentials in Settings first.');
            return;
        }

        try {
            this.modifyInProgress = true;
            this.updateOperationStatus('modify', 'in-progress');
            
            utils.showOperationSpinner(`Starting Modify Users (${this.currentFileInfo.records} records)...`, this.currentFileInfo.name);
            utils.log(`Modify Users started – action: Modify Users (${this.currentFileInfo.records} records)`, 'info');

            utils.startWorkflowSteps();

            // Get worker token
            utils.log('Getting worker token for modify operation', 'info');
            const tokenResponse = await utils.getWorkerToken();
            
            if (!tokenResponse.success) {
                throw new Error(`Failed to get worker token: ${tokenResponse.message}`);
            }

            utils.updateTokenStep(tokenResponse.data.access_token, tokenResponse.data.expires_in);

            // Read and parse file
            const text = await this.readFileAsText(this.currentFile);
            const parsedData = Papa.parse(text, { header: true, skipEmptyLines: true });
            
            utils.addFileLoadingStep(this.currentFileInfo.name, parsedData.data.length);
            utils.addProcessingStep();

            // Start progress simulation
            utils.startProgressSimulation(parsedData.data.length, 6000, this.currentFileInfo.name);

            // Process the modification
            const results = await this.processModify(parsedData.data, {
                environmentId: settings.environmentId,
                clientId: settings.clientId,
                clientSecret: settings.clientSecret,
                accessToken: tokenResponse.data.access_token
            });

            utils.addFinalizingStep(results.successCount, results.errorCount, 'Modify');
            utils.completeOperationSpinner(results.successCount, results.errorCount);
            
            this.updateOperationStatus('modify', 'completed', results);
            this.displayResults('Modify Results', results.results);
            
            utils.log(`Modified ${results.successCount} users (${results.errorCount} failed) in ${results.duration}ms.`, 'info');
            utils.log(`Action complete – Modify Users: ${results.successCount}, Failed: ${results.errorCount} ✅`, 'info');

        } catch (error) {
            console.error('Modify operation failed:', error);
            utils.log(`Modify operation failed: ${error.message}`, 'error');
            this.updateOperationStatus('modify', 'failed', null, error.message);
            utils.failOperationSpinner('step-processing', error.message);
        } finally {
            this.modifyInProgress = false;
            setTimeout(() => utils.hideSpinner(), 2000);
        }
    }

    async deleteUsers() {
        // Main delete users function
        // DEBUG: Check if CSV contains usernames or user IDs for deletion
        if (this.deleteInProgress) {
            utils.showModal('Warning', 'Delete operation already in progress.');
            return;
        }

        if (!this.currentFile) {
            utils.showModal('Warning', 'Please select a CSV file first.');
            return;
        }

        const settings = utils.getSettings();
        if (!settings || !settings.environmentId || !settings.clientId || !settings.clientSecret) {
            utils.showModal('Error', 'Please configure your PingOne credentials in Settings first.');
            return;
        }

        try {
            this.deleteInProgress = true;
            this.updateOperationStatus('delete', 'in-progress');
            
            utils.showOperationSpinner(`Starting Delete Users (${this.currentFileInfo.records} records)...`, this.currentFileInfo.name);
            utils.log(`Delete Users started – action: Delete Users (${this.currentFileInfo.records} records)`, 'info');

            utils.startWorkflowSteps();

            // Get worker token
            const tokenResponse = await utils.getWorkerToken();
            
            if (!tokenResponse.success) {
                throw new Error(`Failed to get worker token: ${tokenResponse.message}`);
            }

            utils.updateTokenStep(tokenResponse.data.access_token, tokenResponse.data.expires_in);

            // Read and parse file
            const text = await this.readFileAsText(this.currentFile);
            const parsedData = Papa.parse(text, { header: true, skipEmptyLines: true });
            
            utils.addFileLoadingStep(this.currentFileInfo.name, parsedData.data.length);
            utils.addProcessingStep();

            // Start progress simulation
            utils.startProgressSimulation(parsedData.data.length, 5000, this.currentFileInfo.name);

            // Process the deletion
            const results = await this.processDelete(parsedData.data, {
                environmentId: settings.environmentId,
                clientId: settings.clientId,
                clientSecret: settings.clientSecret,
                accessToken: tokenResponse.data.access_token
            });

            utils.addFinalizingStep(results.successCount, results.errorCount, 'Delete');
            utils.completeOperationSpinner(results.successCount, results.errorCount);
            
            this.updateOperationStatus('delete', 'completed', results);
            this.displayResults('Delete Results', results.results);
            
            utils.log(`Deleted ${results.successCount} users (${results.errorCount} failed).`, 'info');
            utils.log(`Action complete – Delete Users: ${results.successCount}, Failed: ${results.errorCount} ✅`, 'info');

        } catch (error) {
            console.error('Delete operation failed:', error);
            utils.log(`Delete operation failed: ${error.message}`, 'error');
            this.updateOperationStatus('delete', 'failed', null, error.message);
            utils.failOperationSpinner('step-processing', error.message);
        } finally {
            this.deleteInProgress = false;
            setTimeout(() => utils.hideSpinner(), 2000);
        }
    }

    async deleteUserByUsername() {
        // Delete single user by username
        // DEBUG: Check if username field is populated and valid
        const usernameInput = document.getElementById('delete-username');
        const username = usernameInput?.value?.trim();

        if (!username) {
            utils.showModal('Warning', 'Please enter a username to delete.');
            return;
        }

        const settings = utils.getSettings();
        if (!settings || !settings.environmentId || !settings.clientId || !settings.clientSecret) {
            utils.showModal('Error', 'Please configure your PingOne credentials in Settings first.');
            return;
        }

        // Confirm deletion
        if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
            return;
        }

        try {
            utils.showSpinner('Starting Delete Single User...');
            utils.log('Delete Single User started – action: Delete Single User', 'info');

            // Get worker token
            const tokenResponse = await utils.getWorkerToken();
            
            if (!tokenResponse.success) {
                throw new Error(`Failed to get worker token: ${tokenResponse.message}`);
            }

            // Process single user deletion
            const result = await this.processSingleDelete(username, {
                environmentId: settings.environmentId,
                clientId: settings.clientId,
                clientSecret: settings.clientSecret,
                accessToken: tokenResponse.data.access_token
            });

            if (result.success) {
                utils.showModal('Success', `User "${username}" deleted successfully.`);
                usernameInput.value = ''; // Clear the input
                utils.log(`Successfully deleted user: ${username}`, 'info');
            } else {
                throw new Error(result.message || 'Unknown error occurred');
            }

        } catch (error) {
            console.error('Single delete processing error:', error);
            utils.log(`Failed to delete user: ${username} - ${error.message}`, 'error');
            utils.showModal('Error', `Failed to delete user "${username}": ${error.message}`);
        } finally {
            setTimeout(() => utils.hideSpinner(), 2000);
        }
    }

    // Helper function to read file as text
    // DEBUG: If file reading fails, check file encoding and browser compatibility
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    showImportProgress() {
        // Show import progress indicators
        // Legacy function - progress now handled by utils.showOperationSpinner()
    }

    hideImportProgress() {
        // Hide import progress indicators  
        // Legacy function - progress now handled by utils.hideSpinner()
    }

    async processImport(records, credentials) {
        // Process bulk user import
        // DEBUG: Check server logs for detailed PingOne API responses
        const startTime = Date.now();
        
        try {
            const response = await fetch('/api/import/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    users: records,
                    environmentId: credentials.environmentId,
                    clientId: credentials.clientId,
                    clientSecret: credentials.clientSecret
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const duration = Date.now() - startTime;
            
            return {
                ...result,
                duration
            };
        } catch (error) {
            console.error('Import processing error:', error);
            throw error;
        }
    }

    async processModify(records, credentials) {
        // Process bulk user modification
        // DEBUG: Ensure CSV contains user IDs or usernames for modification
        const startTime = Date.now();
        
        try {
            const response = await fetch('/api/modify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    users: records,
                    environmentId: credentials.environmentId,
                    clientId: credentials.clientId,
                    clientSecret: credentials.clientSecret
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const duration = Date.now() - startTime;
            
            return {
                ...result,
                duration
            };
        } catch (error) {
            console.error('Modify processing error:', error);
            throw error;
        }
    }

    async processDelete(records, credentials) {
        // Process bulk user deletion
        // DEBUG: Check if usernames exist in PingOne before attempting deletion
        const startTime = Date.now();
        
        try {
            // Extract usernames from records (assuming 'username' field exists)
            const usernames = records.map(record => record.username).filter(Boolean);
            
            if (usernames.length === 0) {
                throw new Error('No valid usernames found in CSV file');
            }

            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    usernames: usernames,
                    environmentId: credentials.environmentId,
                    clientId: credentials.clientId,
                    clientSecret: credentials.clientSecret
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const duration = Date.now() - startTime;
            
            return {
                ...result,
                duration
            };
        } catch (error) {
            console.error('Delete processing error:', error);
            throw error;
        }
    }

    async processSingleDelete(username, credentials) {
        // Process single user deletion
        // DEBUG: Check PingOne user existence before deletion attempt
        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    usernames: [username],
                    environmentId: credentials.environmentId,
                    clientId: credentials.clientId,
                    clientSecret: credentials.clientSecret
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            
            // Check if the single user was successfully deleted
            if (result.results && result.results.length > 0) {
                const userResult = result.results[0];
                return {
                    success: userResult.status === 'deleted',
                    message: userResult.message || 'User deleted successfully'
                };
            } else {
                return {
                    success: false,
                    message: 'No result returned from server'
                };
            }
        } catch (error) {
            console.error('Single delete processing error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    displayResults(title, results) {
        // Display operation results in the results section
        // DEBUG: If results don't display, check results array structure
        this.resultsData = results || [];
        this.currentPage = 1;
        
        const titleElement = document.getElementById('results-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
        
        this.renderResults();
        
        // Show results section
        const resultsSection = document.getElementById('results-section');
        if (resultsSection) {
            resultsSection.style.display = 'block';
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    renderResults() {
        // Render paginated results table
        // DEBUG: Check if resultsData is properly populated
        const tbody = document.getElementById('results-tbody');
        const summary = document.getElementById('results-summary');
        
        if (!tbody || !this.resultsData) return;

        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.recordsPerPage;
        const endIndex = startIndex + this.recordsPerPage;
        const pageData = this.resultsData.slice(startIndex, endIndex);

        // Update summary
        if (summary) {
            const totalRecords = this.resultsData.length;
            const successCount = this.resultsData.filter(r => r.status === 'imported' || r.status === 'modified' || r.status === 'deleted').length;
            const errorCount = totalRecords - successCount;
            
            summary.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, totalRecords)} of ${totalRecords} records (${successCount} successful, ${errorCount} failed)`;
        }

        // Render table rows
        tbody.innerHTML = pageData.map((result, index) => {
            const globalIndex = startIndex + index;
            const statusClass = result.status === 'imported' || result.status === 'modified' || result.status === 'deleted' ? 'success' : 'error';
            const showDebugButton = result.status !== 'imported' && result.status !== 'modified' && result.status !== 'deleted';
            
            return `
                <tr class="result-row ${statusClass}">
                    <td>${globalIndex + 1}</td>
                    <td>${result.username || 'N/A'}</td>
                    <td class="status-${statusClass}">${result.status || 'unknown'}</td>
                    <td>${result.message || 'No message'}</td>
                    <td class="actions-column">
                        ${showDebugButton ? `<button class="debug-btn" onclick="mainPage.showDebugDetails(${globalIndex})">Debug</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        this.renderPagination();
    }

    renderPagination() {
        // Render pagination controls
        // DEBUG: Check totalPages calculation if pagination doesn't work
        const pagination = document.getElementById('results-pagination');
        if (!pagination || !this.resultsData) return;

        const totalPages = Math.ceil(this.resultsData.length / this.recordsPerPage);
        
        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        
        let paginationHTML = '';
        
        // Previous button
        paginationHTML += `<button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} onclick="mainPage.goToPage(${this.currentPage - 1})">Previous</button>`;
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === this.currentPage) {
                paginationHTML += `<button class="pagination-btn active">${i}</button>`;
            } else {
                paginationHTML += `<button class="pagination-btn" onclick="mainPage.goToPage(${i})">${i}</button>`;
            }
        }
        
        // Next button
        paginationHTML += `<button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="mainPage.goToPage(${this.currentPage + 1})">Next</button>`;
        
        pagination.innerHTML = paginationHTML;
    }

    goToPage(page) {
        // Navigate to specific results page
        this.currentPage = page;
        this.renderResults();
    }

    showDebugDetails(index) {
        // Show detailed debug information for failed operations
        // DEBUG: This provides detailed error information for troubleshooting
        const result = this.resultsData[index];
        if (!result) return;

        const debugInfo = `
Debug Information for ${result.username || 'Unknown User'}
=================================
Status: ${result.status || 'unknown'}
Row Number: ${index + 1}

Error Message:
${result.message || 'No error message available'}

Full Error Details:
${result.error || 'No additional error details available'}

Line Content:
${JSON.stringify(result, null, 2)}
        `;

        // Create debug modal
        const modal = document.createElement('div');
        modal.className = 'debug-modal-overlay';
        modal.innerHTML = `
            <div class="debug-modal">
                <div class="debug-modal-header">
                    <h3>Debug Information</h3>
                    <button class="debug-modal-close">&times;</button>
                </div>
                <div class="debug-modal-content">
                    <pre class="debug-info">${debugInfo}</pre>
                    <div class="debug-actions">
                        <button class="copy-debug-btn">Copy Debug Info</button>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.debug-modal-close').onclick = () => modal.remove();
        modal.querySelector('.copy-debug-btn').onclick = () => {
            navigator.clipboard.writeText(debugInfo).then(() => {
                utils.showModal('Success', 'Debug information copied to clipboard.');
            });
        };
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        document.body.appendChild(modal);
    }

    exportResults() {
        // Export results to CSV file
        // DEBUG: Check if resultsData is available before export
        if (!this.resultsData || this.resultsData.length === 0) {
            utils.showModal('Warning', 'No results to export.');
            return;
        }

        try {
            // Convert results to CSV format
            const headers = ['Row', 'Username', 'Status', 'Message'];
            const csvData = this.resultsData.map((result, index) => [
                index + 1,
                result.username || 'N/A',
                result.status || 'unknown',
                (result.message || 'No message').replace(/"/g, '""') // Escape quotes
            ]);

            // Create CSV content
            const csvContent = [
                headers.join(','),
                ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `pingone-results-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            utils.log('Results exported to CSV', 'info');
        } catch (error) {
            console.error('Export error:', error);
            utils.showModal('Error', `Failed to export results: ${error.message}`);
        }
    }
}

// Initialize main page when DOM is loaded
// DEBUG: If page doesn't initialize, check for JavaScript errors in console
document.addEventListener('DOMContentLoaded', () => {
    window.mainPage = new MainPage();
}); 
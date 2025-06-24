// Main page functionality for Ping Identity User Management
// This file handles all user operations: import, modify, delete
// Debugging: Check browser console for detailed operation logs

if (window.utils && typeof window.utils.setupSpinner === 'function') {
    window.utils.setupSpinner();
}

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
        await this.waitForTippy();
        this.setupEventListeners();
        this.loadPersistedState();
        this.initializeTooltips();
        utils.log('Main page initialized', 'info');

        // TEMP: Credential check on main page load
        const credentials = utils.getSettings();
        if (!credentials || !credentials.environmentId || !credentials.clientId || (credentials.useClientSecret && !credentials.clientSecret)) {
            utils.showModal(
                'Configuration Error',
                'Your PingOne credentials are not configured. Please go to the Settings page to configure them.',
                { showCancel: false, confirmText: 'Go to Settings', onConfirm: () => window.location.href = 'settings.html' }
            );
        }
    }

    async waitForUtils() {
        // DEBUG: If this loops indefinitely, utils.js failed to load
        while (!window.utils) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async waitForTippy() {
        // Wait for Tippy.js to be available
        while (typeof window.tippy === 'undefined') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    initializeTooltips() {
        // Initialize Tippy.js tooltips for all elements with data-tippy-content
        // DEBUG: If tooltips don't show, check if Tippy.js library loaded correctly
        const tooltipElements = document.querySelectorAll('[data-tippy-content]');
        tooltipElements.forEach(element => {
            if (typeof window.tippy !== 'undefined') {
                tippy(element, {
                    content: element.getAttribute('data-tippy-content'),
                    placement: 'top',
                    arrow: true,
                    theme: 'light',
                    animation: 'scale',
                    duration: [200, 150]
                });
            }
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
        try {
            const fileInfoJson = localStorage.getItem('lastSelectedFile');
            if (fileInfoJson) {
                const fileInfo = JSON.parse(fileInfoJson);
                
                // Create a synthetic file object
                const file = new File([''], fileInfo.name, {
                    type: fileInfo.type || 'text/csv',
                    lastModified: fileInfo.lastModified || Date.now()
                });
                
                // Set the current file and update UI
                this.currentFile = file;
                this.currentFileInfo = {
                    name: fileInfo.name,
                    size: fileInfo.size,
                    lastModified: fileInfo.lastModified,
                    type: fileInfo.type
                };
                
                // Update the file input
                const fileInput = document.getElementById('csv-file');
                if (fileInput) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;
                }
                
                // Update the UI
                this.updateFileInfo(file);
                this.enableActionButtons();
                
                utils.log('File selection restored from previous session', 'info');
            }
        } catch (error) {
            console.error('Error loading persisted file selection:', error);
            localStorage.removeItem('lastSelectedFile'); // Clear corrupted data
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentFile = file;
        
        // Save file info to localStorage
        const fileInfo = {
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: file.type
        };
        
        // Save to both localStorage and settings
        localStorage.setItem('lastSelectedFile', JSON.stringify(fileInfo));
        
        // Also update the settings in case we want to sync with server later
        const settings = utils.getSettings();
        settings.lastSelectedFile = fileInfo;
        utils.saveSettings(settings);

        // Update UI
        this.updateFileInfo(file);
        this.enableActionButtons(true);
        
        // Update status indicators
        this.updateOperationStatus('import', 'ready');
        this.updateOperationStatus('modify', 'ready');
        this.updateOperationStatus('delete', 'ready');
        
        // Log the file selection
        utils.log(`File selected: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
    }

    updateFileInfo(file) {
        if (!file) return;
        
        // Format file size
        const formatFileSize = (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        // Update the current file display
        const currentFileElement = document.getElementById('current-file');
        if (currentFileElement) {
            currentFileElement.textContent = file.name;
            currentFileElement.title = `${file.name} (${formatFileSize(file.size)})`;
        }

        // Show the file info section
        const fileStatusElement = document.getElementById('current-file-status');
        if (fileStatusElement) {
            fileStatusElement.classList.remove('hidden');
        }

        // Update the file info display
        const fileInfoElement = document.getElementById('selected-file-info');
        if (fileInfoElement) {
            fileInfoElement.innerHTML = `
                <div><strong>File:</strong> ${file.name}</div>
                <div><strong>Size:</strong> ${formatFileSize(file.size)}</div>
                <div><strong>Last Modified:</strong> ${new Date(file.lastModified).toLocaleString()}</div>
            `;
        }
    }

    enableActionButtons(enable = true) {
        // Enable or disable action buttons based on file selection
        const buttons = [
            'import-btn',
            'modify-btn',
            'delete-btn',
            'export-results'
        ];

        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = !enable;
            }
        });

        // Update UI state
        const fileStatus = document.getElementById('current-file-status');
        if (fileStatus) {
            if (enable) {
                fileStatus.classList.remove('hidden');
            } else {
                fileStatus.classList.add('hidden');
            }
        }
    }

    displayCurrentFileStatus(fileInfo, sourceClass) {
        // Display current file information in the UI as a table, collapsible
        const statusElement = document.getElementById('current-file-status');
        const detailsElement = document.getElementById('current-file-details');
        const header = document.getElementById('file-info-collapsible-header');
        const caret = document.getElementById('file-info-caret');
        if (statusElement && detailsElement && header && caret) {
            if (fileInfo) {
                // Show section and header
                statusElement.classList.remove('hidden');
                statusElement.style.display = 'block';
                header.style.display = 'flex';
                // Default: expanded
                detailsElement.style.display = 'block';
                caret.style.transform = 'rotate(90deg)';
                // Inject table
                const columns = (fileInfo.headers && fileInfo.headers.length) ? fileInfo.headers.join(', ') : '-';
                detailsElement.innerHTML = `
                    <div class=\"current-file-info show ${sourceClass}\">
                        <table class=\"file-info-table\">
                            <tr><th>File Name</th><td>${fileInfo.name}</td></tr>
                            <tr><th>File Size</th><td>${this.formatFileSize(fileInfo.size)}</td></tr>
                            <tr><th>Number of Entries</th><td>${fileInfo.records}</td></tr>
                            <tr><th>Columns</th><td>${columns}</td></tr>
                            <tr><th>Last Modified</th><td>${fileInfo.lastModified || '-'}</td></tr>
                            <tr><th>Created</th><td>${fileInfo.created || '-'}</td></tr>
                        </table>
                    </div>
                `;
                // Collapsible logic
                header.onclick = () => {
                    if (detailsElement.style.display === 'none') {
                        detailsElement.style.display = 'block';
                        caret.style.transform = 'rotate(90deg)';
                    } else {
                        detailsElement.style.display = 'none';
                        caret.style.transform = 'rotate(0deg)';
                    }
                };
            } else {
                // Hide section and header, clear details
                statusElement.classList.add('hidden');
                statusElement.style.display = 'none';
                header.style.display = 'none';
                detailsElement.innerHTML = '';
            }
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

    clearFileSelection() {
        // Reset file selection state
        this.currentFile = null;
        this.currentFileInfo = null;
        localStorage.removeItem('currentFileInfo');
        // Clear UI elements
        const fileInput = document.getElementById('csv-file');
        if (fileInput) fileInput.value = '';
        const statusElement = document.getElementById('current-file-status');
        const detailsElement = document.getElementById('current-file-details');
        const header = document.getElementById('file-info-collapsible-header');
        if (statusElement && detailsElement && header) {
            statusElement.classList.add('hidden');
            statusElement.style.display = 'none';
            header.style.display = 'none';
            detailsElement.innerHTML = '';
        }
        utils.log('File selection cleared', 'info');
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
        // Import users from CSV file with real-time progress
        // DEBUG: Check browser console and server logs for detailed operation status
        if (this.importInProgress) {
            utils.log('Import already in progress', 'warning');
            return;
        }

        if (!this.currentFile) {
            utils.showModal(
                'Warning',
                `<div style="display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0;">
                    <span style="font-size: 2rem; color: #c8102e;">⚠️</span>
                    <span style="font-size: 1.1rem; color: #b71c1c; font-weight: 500;">Please select a CSV file first.</span>
                </div>`,
                { showCancel: false }
            );
            return;
        }

        this.importInProgress = true;
        
        try {
            // Get credentials from settings
            const credentials = utils.getSettings();
            
            if (!credentials || !credentials.environmentId || !credentials.clientId || (credentials.useClientSecret && !credentials.clientSecret)) {
                utils.showModal(
                    'Configuration Error',
                    'Your PingOne credentials are not configured. Please go to the Settings page to configure them.',
                    { showCancel: false, confirmText: 'Go to Settings', onConfirm: () => window.location.href = 'settings.html' }
                );
                this.importInProgress = false;
                return;
            }
            
            utils.log('Retrieved credentials for import', 'debug', { credentials });

            // Parse CSV file
            utils.log('Parsing CSV file for import', 'info', { fileName: this.currentFile.name });
            const records = await utils.parseCSV(this.currentFile);
            
            utils.log('CSV parsing result', 'debug', { 
                recordCount: records?.length || 0,
                firstRecord: records?.[0] || null
            });
            
            if (!records || records.length === 0) {
                throw new Error('No valid records found in CSV file');
            }

            // Show operation spinner with initial status
            utils.showOperationSpinner(
                'Bulk User Import',
                this.currentFile.name,
                'Import',
                records.length
            );
            
            // Start workflow steps
            utils.startWorkflowSteps();
            utils.addFileLoadingStep(this.currentFile.name, records.length);
            utils.addProcessingStep();
            
            // Update status to show we're starting the API call
            utils.updateSpinnerSubtitle('Starting bulk import operation...');

            // Process import with real-time progress
            utils.log('Starting bulk import operation', 'info', { 
                recordCount: records.length,
                environmentId: credentials.environmentId.substring(0, 8) + '...'
            });
            
            const result = await this.processImport(records, credentials);
            
            // Update status to show completion
            utils.updateSpinnerSubtitle('Import operation completed');
            
            // Display results
            if (result.success) {
                const successCount = result.results?.filter(r => r.status === 'imported').length || 0;
                const errorCount = result.results?.filter(r => r.status === 'error').length || 0;
                const skippedCount = result.results?.filter(r => r.status === 'skipped').length || 0;
                
                utils.log('Import operation completed successfully', 'info', {
                    totalRecords: records.length,
                    successCount,
                    errorCount,
                    skippedCount,
                    duration: result.duration
                });
                
                this.updateOperationStatus('Import', 'completed', result.results);
                this.displayResults(`Import Results (${successCount} successful, ${errorCount} failed, ${skippedCount} skipped)`, result.results);
                
                // Complete spinner with all counts
                utils.completeOperationSpinner(successCount, errorCount, skippedCount);
            } else {
                throw new Error(result.error || 'Import operation failed');
            }
            
        } catch (error) {
            utils.log('Import operation failed', 'error', { error: error.message });
            
            // Update status to show error
            utils.updateSpinnerSubtitle(`Import failed: ${error.message}`);
            
            // Show error in spinner but don't show modal
            utils.failOperationSpinner('step-processing', error.message);
            
            // Always complete spinner with 0/0 to show summary
            utils.completeOperationSpinner(0, 0);
            
            this.updateOperationStatus('Import', 'failed', null, error);
        } finally {
            this.importInProgress = false;
            utils.disconnectProgress();
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
            utils.showModal(
                'Warning',
                `<div style="display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0;">
                    <span style="font-size: 2rem; color: #c8102e;">⚠️</span>
                    <span style="font-size: 1.1rem; color: #b71c1c; font-weight: 500;">Please select a CSV file first.</span>
                </div>`,
                { showCancel: false }
            );
            return;
        }

        const credentials = utils.getSettings();
        if (!credentials || !credentials.environmentId || !credentials.clientId || (credentials.useClientSecret && !credentials.clientSecret)) {
            utils.showModal(
                'Configuration Error',
                'Your PingOne credentials are not configured. Please go to the Settings page to configure them.',
                { showCancel: false, confirmText: 'Go to Settings', onConfirm: () => window.location.href = 'settings.html' }
            );
            return;
        }

        try {
            this.modifyInProgress = true;
            this.updateOperationStatus('modify', 'in-progress');
            
            utils.showOperationSpinner('Modifying Users...', this.currentFile.name, 'User Modification', this.currentFileInfo.records);
            utils.log(`Modify Users started – action: Modify Users (${this.currentFileInfo.records} records)`, 'info');

            utils.startWorkflowSteps();

            // Read and parse file
            const records = await utils.parseCSV(this.currentFile);
            
            utils.addFileLoadingStep(this.currentFileInfo.name, records.length);
            utils.addProcessingStep();

            // Start progress simulation
            utils.startProgressSimulation(records.length, 6000, this.currentFileInfo.name);

            // Process the modification
            const results = await this.processModify(records, credentials);

            utils.addFinalizingStep(results.summary.successful, results.summary.failed, 'Modify');
            utils.completeOperationSpinner(results.summary.successful, results.summary.failed);
            
            this.updateOperationStatus('modify', 'completed', results);
            this.displayResults('Modify Results', results.results);
            
            utils.log(`Modified ${results.summary.successful} users (${results.summary.failed} failed) in ${results.duration}ms.`, 'info');
            utils.log(`Action complete – Modify Users: ${results.summary.successful}, Failed: ${results.summary.failed} ✅`, 'info');

        } catch (error) {
            console.error('Modify operation failed:', error);
            utils.log(`Modify operation failed: ${error.message}`, 'error');
            this.updateOperationStatus('modify', 'failed', null, error.message);
            
            // Show error in spinner but don't show modal
            utils.failOperationSpinner('step-processing', error.message);
            
            // Don't show error modal - let the spinner handle completion
            // The user can close the spinner and see results
            
        } finally {
            this.modifyInProgress = false;
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
            utils.showModal(
                'Warning',
                `<div style="display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0;">
                    <span style="font-size: 2rem; color: #c8102e;">⚠️</span>
                    <span style="font-size: 1.1rem; color: #b71c1c; font-weight: 500;">Please select a CSV file first.</span>
                </div>`,
                { showCancel: false }
            );
            return;
        }

        const credentials = utils.getSettings();
        if (!credentials || !credentials.environmentId || !credentials.clientId || (credentials.useClientSecret && !credentials.clientSecret)) {
            utils.showModal(
                'Configuration Error',
                'Your PingOne credentials are not configured. Please go to the Settings page to configure them.',
                { showCancel: false, confirmText: 'Go to Settings', onConfirm: () => window.location.href = 'settings.html' }
            );
            return;
        }

        try {
            this.deleteInProgress = true;
            this.updateOperationStatus('delete', 'in-progress');
            
            utils.showOperationSpinner('Deleting Users...', this.currentFile.name, 'User Deletion', this.currentFileInfo.records);
            utils.log(`Delete Users started – action: Delete Users (${this.currentFileInfo.records} records)`, 'info');

            utils.startWorkflowSteps();

            // Read and parse file
            const records = await utils.parseCSV(this.currentFile);
            
            utils.addFileLoadingStep(this.currentFileInfo.name, records.length);
            utils.addProcessingStep();

            // Start progress simulation
            utils.startProgressSimulation(records.length, 5000, this.currentFileInfo.name);

            // Process the deletion
            const results = await this.processDelete(records, credentials);

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
            
            // Show error in spinner but don't show modal
            utils.failOperationSpinner('step-processing', error.message);
            
            // Don't show error modal - let the spinner handle completion
            // The user can close the spinner and see results
            
        } finally {
            this.deleteInProgress = false;
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
            utils.showOperationSpinner('Deleting User...', username, 'Single User Deletion', 1);
            utils.log('Delete Single User started – action: Delete Single User', 'info');

            // Process single user deletion - server will handle token
            const result = await this.processSingleDelete(username, settings);

            if (result.success) {
                utils.completeOperationSpinner(1, 0); // 1 success, 0 failed
                this.updateOperationStatus('delete', 'completed', result.results);
                this.displayResults('Delete Single User Result', [result]);
            } else {
                throw new Error(result.message || 'Failed to delete user');
            }

        } catch (error) {
            utils.handleError(error, 'deleteUserByUsername');
            utils.failOperationSpinner('step-processing', error.message);
        }
    }

    readFileAsText(file) {
        // Read file as text for parsing
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    // Legacy functions - now handled by utils.showOperationSpinner() and utils.hideSpinner()
    // These functions are kept for backward compatibility but are no longer used
    showImportProgress() {
        // Legacy function - progress now handled by utils.showOperationSpinner()
        utils.log('showImportProgress called (legacy)', 'debug');
    }

    hideImportProgress() {
        // Legacy function - progress now handled by utils.hideSpinner()
        utils.log('hideImportProgress called (legacy)', 'debug');
    }

    async processImport(records, credentials) {
        // Process bulk user import with real-time progress
        // DEBUG: Check server logs for detailed PingOne API responses
        const startTime = Date.now();
        
        try {
            // Update status to show we're making the API call
            utils.updateSpinnerSubtitle('Sending import request to server...');
            
            const payload = {
                users: records,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            };
            
            utils.log('Sending import payload to /api/import/bulk', 'debug', {
                payload: {
                    ...payload,
                    clientSecret: 'REDACTED', // Do not log the actual secret
                    users: `${payload.users.length} records`
                }
            });
            
            const response = await fetch('/api/import/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: utils.currentOperationController.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                utils.log('Import API error response', 'error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText
                });
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            
            // Update status to show we're connecting to progress updates
            utils.updateSpinnerSubtitle('Connecting to progress updates...');
            
            // Connect to SSE for real-time progress updates
            if (result.operationId) {
                utils.connectToProgress(result.operationId);
            }
            
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
        // Process bulk user modification with real-time progress
        // DEBUG: Ensure CSV contains user IDs or usernames for modification
        const startTime = Date.now();
        
        try {
            // Update status to show we're making the API call
            utils.updateSpinnerSubtitle('Sending modify request to server...');
            
            const payload = {
                users: records,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            };
            
            utils.log('Sending modify payload to /api/modify/bulk', 'debug', {
                payload: {
                    ...payload,
                    clientSecret: 'REDACTED', // Do not log the actual secret
                    users: `${payload.users.length} records`
                }
            });
            
            const response = await fetch('/api/modify/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: utils.currentOperationController.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                utils.log('Modify API error response', 'error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText
                });
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            
            // Update status to show we're connecting to progress updates
            utils.updateSpinnerSubtitle('Connecting to progress updates...');
            
            // Connect to SSE for real-time progress updates
            if (result.operationId) {
                utils.connectToProgress(result.operationId, 'modify');
            }
            
            // Wait for operation to complete via SSE
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Operation timed out'));
                }, 300000); // 5 minutes timeout
                
                const checkComplete = () => {
                    const spinner = document.getElementById('spinner-overlay');
                    if (spinner && spinner.classList.contains('hidden')) {
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        setTimeout(checkComplete, 100);
                    }
                };
                checkComplete();
            });
            
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
        // Process bulk user deletion with real-time progress
        // DEBUG: Check if usernames exist in PingOne before attempting deletion
        const startTime = Date.now();
        
        try {
            // Extract usernames from records (assuming 'username' field exists)
            const usernames = records.map(record => record.username).filter(Boolean);
            
            if (usernames.length === 0) {
                throw new Error('No valid usernames found in CSV file');
            }

            // Update status to show we're making the API call
            utils.updateSpinnerSubtitle('Sending delete request to server...');
            
            const payload = {
                usernames: usernames,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            };
            
            utils.log('Sending delete payload to /api/delete', 'debug', {
                payload: {
                    ...payload,
                    clientSecret: 'REDACTED', // Do not log the actual secret
                    usernames: `${payload.usernames.length} usernames`
                }
            });

            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: utils.currentOperationController.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                utils.log('Delete API error response', 'error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText
                });
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            
            // Update status to show we're connecting to progress updates
            utils.updateSpinnerSubtitle('Connecting to progress updates...');
            
            // Connect to SSE for real-time progress updates
            if (result.operationId) {
                utils.connectToProgress(result.operationId, 'delete');
            }
            
            // Wait for operation to complete via SSE
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Operation timed out'));
                }, 300000); // 5 minutes timeout
                
                const checkComplete = () => {
                    const spinner = document.getElementById('spinner-overlay');
                    if (spinner && spinner.classList.contains('hidden')) {
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        setTimeout(checkComplete, 100);
                    }
                };
                checkComplete();
            });
            
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
            const response = await fetch('/api/delete/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    environmentId: credentials.environmentId,
                    clientId: credentials.clientId,
                    clientSecret: credentials.clientSecret,
                }),
                signal: utils.currentOperationController.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            return result;
            
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
            const skippedCount = this.resultsData.filter(r => r.status === 'skipped').length;
            const errorCount = totalRecords - successCount - skippedCount;
            summary.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, totalRecords)} of ${totalRecords} records (${successCount} successful, ${errorCount} failed, ${skippedCount} skipped)`;
        }

        // Render table rows
        tbody.innerHTML = pageData.map((result, index) => {
            const globalIndex = startIndex + index;
            let statusClass = 'error';
            if (result.status === 'imported' || result.status === 'modified' || result.status === 'deleted') statusClass = 'success';
            else if (result.status === 'skipped') statusClass = 'skipped';
            const showDebugButton = result.status !== 'imported' && result.status !== 'modified' && result.status !== 'deleted' && result.status !== 'skipped';
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
window.addEventListener('DOMContentLoaded', () => {
    if (window.utils && typeof window.utils.setupSpinner === 'function') {
        window.utils.setupSpinner();
    }
    window.mainPage = new MainPage();
}); 
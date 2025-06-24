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

    async loadPersistedFileSelection() {
        try {
            var settings = utils.getSettings() || {};
            var fileInfo = null;
            var source = '';
            
            // First try to load from settings (default file)
            if (settings.settingsDefaultFile) {
                fileInfo = settings.settingsDefaultFile;
                source = 'settings';
            } 
            // If no default file in settings, try last selected file
            else if (localStorage.getItem('lastSelectedFile')) {
                fileInfo = JSON.parse(localStorage.getItem('lastSelectedFile'));
                source = 'localStorage';
            }
            
            if (!fileInfo) return false; // No file to restore
            
            // Create a synthetic file object
            var file = new File(
                [fileInfo.content], 
                fileInfo.name, 
                { 
                    type: fileInfo.type || 'text/csv',
                    lastModified: fileInfo.lastModified || Date.now()
                }
            );
            
            // Update the file input
            var dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            var fileInput = document.getElementById('csv-file');
            if (fileInput) {
                fileInput.files = dataTransfer.files;
            }
            
            // Update current file and UI
            this.currentFile = file;
            
            // Parse CSV for preview if content exists
            if (fileInfo.content) {
                try {
                    var parseResult = await this.parseCSVPreview(fileInfo.content);
                    this.updateFileInfo(file, parseResult);
                } catch (parseError) {
                    console.error('Error parsing CSV:', parseError);
                    utils.showErrorMessage('Error parsing CSV: ' + parseError.message);
                    this.updateFileInfo(file, {});
                }
            } else {
                // If no content, just update with basic file info
                this.updateFileInfo(file, {});
                utils.log('No file content available for preview', 'warn');
            }
            
            this.enableActionButtons(true);
            
            // Update status indicators
            this.updateOperationStatus('import', 'ready');
            this.updateOperationStatus('modify', 'ready');
            this.updateOperationStatus('delete', 'ready');
            
            // Show file status element if it exists
            var fileStatusElement = document.getElementById('current-file-status');
            if (fileStatusElement) {
                fileStatusElement.classList.remove('hidden');
            }
            
            // Log the source of the restored file
            utils.log('Restored file from ' + source + ': ' + fileInfo.name + ' (' + this.formatFileSize(fileInfo.size) + ')', 'info');
            
            return true;
            
        } catch (error) {
            console.error('Error loading persisted file:', error);
            localStorage.removeItem('settingsDefaultFile');
            localStorage.removeItem('lastSelectedFile');
        }
    }

    async handleFileSelect(event) {
        var file = event.target.files[0];
        if (!file) return;

        this.currentFile = file;
        
        var self = this;
        
        try {
            // Show loading state
            utils.showLoading('Processing file...');
            
            // Read file content for preview and storage
            var fileContent = await self.readFileAsText(file);
            
            // Save file info to localStorage with content for persistence
            var fileInfo = {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                type: file.type,
                content: fileContent  // Store content for persistence
            };
            
            // Save to localStorage
            try {
                localStorage.setItem('lastSelectedFile', JSON.stringify(fileInfo));
                
                // Also update the settings in case we want to sync with server later
                var settings = utils.getSettings() || {};
                settings.lastSelectedFile = fileInfo;
                utils.saveSettings(settings);
                
                // Parse CSV for preview
                try {
                    var parseResult = await self.parseCSVPreview(fileContent);
                    
                    // Update UI with file info and CSV preview
                    self.updateFileInfo(file, parseResult);
                    self.enableActionButtons(true);
                    
                    // Update status indicators
                    self.updateOperationStatus('import', 'ready');
                    self.updateOperationStatus('modify', 'ready');
                    self.updateOperationStatus('delete', 'ready');
                    
                    // Show file status element if it exists
                    var fileStatusElement = document.getElementById('current-file-status');
                    if (fileStatusElement) {
                        fileStatusElement.classList.remove('hidden');
                    }
                    
                    // Log successful file selection
                    utils.log('Selected file: ' + file.name + ' (' + self.formatFileSize(file.size) + ')', 'info');
                    
                } catch (parseError) {
                    console.error('Error parsing CSV:', parseError);
                    utils.showErrorMessage('Error parsing CSV: ' + parseError.message);
                    self.clearFileSelection();
                }
                
            } catch (storageError) {
                console.error('Error saving file to storage:', storageError);
                utils.showErrorMessage('Error saving file to storage: ' + storageError.message);
                self.clearFileSelection();
            }
            
        } catch (fileError) {
            console.error('Error reading file:', fileError);
            utils.showErrorMessage('Error reading file: ' + fileError.message);
            self.clearFileSelection();
            
        } finally {
            // Always hide loading state
            utils.hideLoading();
        }
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

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    initializeCollapsibleSections() {
        const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
        
        collapsibleHeaders.forEach(header => {
            // Remove any existing click listeners to prevent duplicates
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);
            
            newHeader.addEventListener('click', () => {
                // Toggle the active class on the header
                newHeader.classList.toggle('active');
                
                // Toggle the content
                const contentId = newHeader.getAttribute('aria-controls');
                const content = document.getElementById(contentId);
                if (content) {
                    const isExpanded = content.style.display !== 'none';
                    content.style.display = isExpanded ? 'none' : 'block';
                    newHeader.setAttribute('aria-expanded', !isExpanded);
                    
                    // Rotate the toggle icon
                    const icon = newHeader.querySelector('.toggle-icon');
                    if (icon) {
                        icon.textContent = isExpanded ? '►' : '▼';
                    }
                }
            });
            
            // Add keyboard support
            newHeader.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    newHeader.click();
                }
            });
        });
    }

    updateFileInfo(file, csvData = {}) {
        try {
            const fileInfoElement = document.getElementById('selected-file-info');
            if (!fileInfoElement) return;

            const { header = [], firstFewRecords = [] } = csvData;
            const fileSize = file.size ? ` (${(file.size / 1024).toLocaleString(undefined, {maximumFractionDigits: 1})} KB)` : '';
            const lastModified = file.lastModified ? new Date(file.lastModified).toLocaleString() : 'N/A';
            const rowCount = firstFewRecords.length;
            const columnCount = header.length;
            
            // Build the file info HTML
            let fileInfoHTML = `
                <div class="file-info">
                    <div class="file-header">
                        <i class="fas fa-file-csv"></i>
                        <h4>${file.name}${fileSize}</h4>
                    </div>
                    <div class="file-details">
                        <div class="file-meta">
                            <span class="file-meta-item">
                                <i class="far fa-calendar-alt"></i> Modified: ${lastModified}
                            </span>`;
                            
            if (rowCount > 0) {
                fileInfoHTML += `
                            <span class="file-meta-item">
                                <i class="fas fa-list-ol"></i> ${rowCount} rows
                            </span>`;
            }
            
            if (columnCount > 0) {
                fileInfoHTML += `
                            <span class="file-meta-item">
                                <i class="fas fa-columns"></i> ${columnCount} columns
                            </span>`;
            }
            
            fileInfoHTML += `
                        </div>`;

            // Add CSV preview if we have data
            if (header && firstFewRecords && firstFewRecords.length > 0) {
                fileInfoHTML += `
                        <div class="file-preview">
                            <div class="preview-header">Preview:</div>
                            <div class="preview-table-container">
                                <table class="preview-table">
                                    <thead>
                                        <tr>${header.map(h => `<th>${h}</th>`).join('')}</tr>
                                    </thead>
                                    <tbody>
                                        ${firstFewRecords.map(row => 
                                            `<tr>${header.map(h => 
                                                `<td>${row[h] || ''}</td>`
                                            ).join('')}</tr>`
                                        ).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>`;
            }

            // Add file actions
            fileInfoHTML += `
                        <div class="file-actions">
                            <button type="button" class="btn-clear" id="clear-file-btn">
                                <i class="fas fa-times"></i> Clear File
                            </button>
                            <button type="button" class="btn-view" id="view-full-file-btn">
                                <i class="fas fa-expand"></i> View Full
                            </button>
                        </div>
                    </div>
                </div>`;
                
            // Set the HTML content
            fileInfoElement.innerHTML = fileInfoHTML;
            
            // Add event listeners for the buttons
            const clearBtn = document.getElementById('clear-file-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.clearFileSelection();
                });
            }
            
            const viewFullBtn = document.getElementById('view-full-file-btn');
            if (viewFullBtn) {
                viewFullBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showFullFileContent(file);
                });
            }
            
            // Show success message
            utils.showSuccessMessage(`File loaded: ${file.name}`);
            
        } catch (error) {
            console.error('Error handling file:', error);
            utils.showErrorMessage(`Error processing file: ${error.message || 'Unknown error'}`);
            this.clearFileSelection();
        }
        // Always hide loading state
        utils.hideLoading();
    }

    clearFileSelection() {
        // Reset file selection state
        this.currentFile = null;
        this.currentFileInfo = null;
        
        // Clear UI elements
        const fileInput = document.getElementById('csv-file');
        if (fileInput) fileInput.value = '';
        
        const fileInfoElement = document.getElementById('selected-file-info');
        if (fileInfoElement) {
            fileInfoElement.innerHTML = `
                <div class="no-file-selected">
                    <i class="fas fa-file-import"></i>
                    <p>No file selected</p>
                    <p class="hint">Upload a CSV file to get started</p>
                </div>`;
            // Legacy function - progress now handled by utils.showOperationSpinner()
            utils.log('showImportProgress called (legacy)', 'debug');
            
            // Hide any loading states
            utils.hideLoading();
        }
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
// Main page functionality for Ping Identity User Management
// This file handles all user operations: import, modify, delete
// Debugging: Check browser console for detailed operation logs

if (window.utils && typeof window.utils.setupSpinner === 'function') {
    window.utils.setupSpinner();
}

// Define and export MainPage class
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
        
        // Bind all methods to maintain 'this' context
        this.importUsers = this.importUsers.bind(this);
        this.modifyUsers = this.modifyUsers.bind(this);
        this.deleteUsers = this.deleteUsers.bind(this);
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.deleteUserByUsername = this.deleteUserByUsername.bind(this);
        
        this.init();
    }

    /**
     * Handles deleting a single user by username
     */
    async deleteUserByUsername() {
        const username = prompt('Enter the username to delete:');
        if (!username) return;
        
        try {
            utils.showSpinner(`Deleting user: ${username}`);
            
            const credentials = utils.getSettings();
            if (!credentials || !credentials.environmentId || !credentials.clientId) {
                throw new Error('PingOne credentials not configured');
            }
            
            // Process the deletion
            const result = await this.processDelete([{ username }], credentials);
            
            if (result.success) {
                utils.showSuccessMessage(`Successfully deleted user: ${username}`);
            } else {
                throw new Error(result.message || `Failed to delete user: ${username}`);
            }
            
        } catch (error) {
            console.error('Delete user error:', error);
            utils.showErrorMessage(`Delete failed: ${error.message}`);
        } finally {
            utils.hideSpinner();
        }
    }

    async init() {
        console.log('Initializing application...');
        console.log('Document ready, setting up event listeners...');
        this.loadPersistedState();
        this.setupEventListeners();
        this.initializeCollapsibleSections();
        this.loadEnvironmentInfo();
        this.initializeTooltips();
        
        // Debug: Check if elements exist
        console.log('Import button exists:', !!document.getElementById('import-btn'));
        console.log('CSV file input exists:', !!document.getElementById('csv-file'));
        
        // DEBUG: If page doesn't load properly, check if utils is available
        await this.waitForUtils();
        await this.waitForTippy();
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
        console.log('Setting up event listeners...');
        
        // File input change handler
        const fileInput = document.getElementById('csv-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                console.log('File selected:', e.target.files[0]?.name || 'No file');
                this.handleFileSelect(e);
            });
        } else {
            console.error('CSV file input not found!');
        }
        
        // Import button click handler
        const importBtn = document.getElementById('import-btn');
        if (importBtn) {
            console.log('Setting up import button click handler');
            importBtn.addEventListener('click', (e) => {
                console.log('=== IMPORT BUTTON CLICKED ===');
                console.log('Event target:', e.target);
                console.log('Current file:', this.currentFile);
                console.log('Current file info:', this.currentFileInfo);
                
                if (!this.currentFile) {
                    console.error('No file selected for import');
                    utils.showErrorMessage('Please select a file first');
                    return;
                }
                
                console.log('Calling importUsers()...');
                this.importUsers().catch(err => {
                    console.error('Error in importUsers:', err);
                    utils.showErrorMessage(`Import failed: ${err.message}`);
                });
            });
            
            // Enable the button for testing
            importBtn.disabled = false;
            console.log('Import button enabled for testing');
        } else {
            console.error('Import button not found!');
        }

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
                    // Hide the credentials alert if it's visible
                    const credentialsAlert = document.getElementById('credentials-alert');
                    if (credentialsAlert) {
                        credentialsAlert.style.display = 'none';
                    }
                }
                utils.log('Environment info loaded successfully', 'info');
            } else {
                throw new Error(envInfo?.message || 'Failed to load environment info');
            }
        } catch (error) {
            console.error('Error loading environment info:', error);
            utils.log('Error loading environment info: ' + error.message, 'error');
            
            // Show credentials alert
            this.showCredentialsAlert();
        } finally {
            utils.hideSpinner();
        }
    }
    
    showCredentialsAlert() {
        // Check if alert already exists
        let alertElement = document.getElementById('credentials-alert');
        
        if (!alertElement) {
            // Create alert element if it doesn't exist
            const mainContent = document.querySelector('.main-content');
            if (!mainContent) return;
            
            alertElement = document.createElement('div');
            alertElement.id = 'credentials-alert';
            alertElement.className = 'alert alert-warning';
            alertElement.style.marginBottom = '2rem';
            alertElement.style.width = '100%';
            alertElement.style.maxWidth = '800px';
            alertElement.style.marginLeft = 'auto';
            alertElement.style.marginRight = 'auto';
            
            // Insert alert at the top of the main content
            mainContent.insertBefore(alertElement, mainContent.firstChild);
        }
        
        // Set alert content
        alertElement.innerHTML = `
            <div style="display: flex; align-items: flex-start;">
                <div style="margin-right: 1rem; font-size: 1.5rem; color: #856404;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div>
                    <h3 style="margin-top: 0; margin-bottom: 0.5rem; color: #856404;">PingOne Credentials Required</h3>
                    <p style="margin-bottom: 1rem;">
                        Please configure your PingOne credentials to use this application. 
                        Go to <a href="settings.html" style="color: #856404; text-decoration: underline; font-weight: 500;">Settings</a> 
                        and enter your Environment ID, Client ID, and Client Secret.
                    </p>
                    <a href="settings.html" class="btn btn-warning">
                        <i class="fas fa-cog"></i> Go to Settings
                    </a>
                </div>
            </div>
        `;
        
        // Make sure alert is visible
        alertElement.style.display = 'block';
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
        console.log('handleFileSelect called');
        const file = event.target.files[0];
        
        if (!file) {
            console.log('No file selected');
            this.clearFileSelection();
            return;
        }

        console.log('File selected:', file.name, 'size:', file.size, 'type:', file.type);
        this.currentFile = file;
        
        try {
            // Show loading state
            utils.showSpinner('Processing file...');
            
            // Read file content
            const fileContent = await this.readFileAsText(file);
            console.log('File read successfully, length:', fileContent.length);
            
            // Parse CSV for preview
            const parseResult = await this.parseCSVPreview(fileContent);
            
            // Validate parse result
            if (!parseResult || !parseResult.firstFewRecords || !Array.isArray(parseResult.firstFewRecords)) {
                throw new Error('Failed to parse CSV: Invalid file format');
            }
            
            console.log('CSV parsed successfully, total records:', parseResult.totalRecords || 0);
            console.log('Preview records:', parseResult.firstFewRecords.length);
            
            // Update UI with file info and CSV preview
            this.updateFileInfo(file, {
                ...parseResult,
                records: parseResult.firstFewRecords, // Ensure backward compatibility
                totalRecords: parseResult.totalRecords || parseResult.firstFewRecords.length
            });
            this.enableActionButtons(true);
            
            // Update status indicators
            this.updateOperationStatus('import', 'ready');
            this.updateOperationStatus('modify', 'ready');
            this.updateOperationStatus('delete', 'ready');
            
            // Show preview for modify section
            this.displayModifyPreview(parseResult.firstFewRecords);
            
            // Show file status element
            const fileStatusElement = document.getElementById('current-file-status');
            if (fileStatusElement) {
                fileStatusElement.classList.remove('hidden');
            }
            
            // Save file info to localStorage
            const fileInfo = {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                type: file.type,
                content: fileContent
            };
            
            try {
                localStorage.setItem('lastSelectedFile', JSON.stringify(fileInfo));
                
                // Update settings
                const settings = window.utils.getSettings() || {};
                settings.lastSelectedFile = fileInfo;
                window.utils.saveSettings(settings);
                
                console.log('File info saved to localStorage');
                
            } catch (storageError) {
                console.error('Error saving file to storage:', storageError);
                // Don't fail the whole operation for storage errors
            }
            
            // Log successful file selection
            utils.log(`Selected file: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
            
            // Update file info display
            this.updateFileInfo(file);
            
        } catch (error) {
            console.error('Error processing file:', error);
            let errorMessage = 'Error processing file';
            
            if (error.message.includes('CSV')) {
                errorMessage = 'Invalid CSV format: ' + error.message;
            } else if (error.name === 'QuotaExceededError') {
                errorMessage = 'File is too large for local storage. Please use a smaller file or clear browser data.';
            } else {
                errorMessage += ': ' + error.message;
            }
            
            utils.showErrorMessage(errorMessage);
            this.clearFileSelection();
            
        } finally {
            utils.hideSpinner();
        }
    }

    enableActionButtons(enable = true) {
        console.log(`enableActionButtons(${enable}) called`);
        
        // Define buttons and their states
        const buttons = [
            { id: 'import-btn', requiresFile: true },
            { id: 'modify-btn', requiresFile: true },
            { id: 'delete-btn', requiresFile: true },
            { id: 'export-results', requiresFile: false }
        ];

        buttons.forEach(buttonInfo => {
            const button = document.getElementById(buttonInfo.id);
            if (!button) {
                console.warn(`Button not found: ${buttonInfo.id}`);
                return;
            }

            // Determine if button should be enabled
            const shouldEnable = enable && (!buttonInfo.requiresFile || this.currentFile);
            
            // Update button state
            button.disabled = !shouldEnable;
            
            // Add/remove visual feedback classes
            if (shouldEnable) {
                button.classList.remove('disabled');
                button.removeAttribute('title');
            } else {
                button.classList.add('disabled');
                if (buttonInfo.requiresFile && !this.currentFile) {
                    button.setAttribute('title', 'Please select a file first');
                }
            }
            
            console.log(`Button ${buttonInfo.id} - enabled: ${shouldEnable}`);
        });

        // Update file status indicator
        const fileStatus = document.getElementById('current-file-status');
        const fileInfoElement = document.getElementById('selected-file-info');
        
        if (enable && this.currentFile) {
            // Show file info
            if (fileStatus) {
                fileStatus.textContent = `Ready: ${this.currentFile.name}`;
                fileStatus.className = 'file-status ready';
            }
            
            // Update file info display
            this.updateFileInfo(this.currentFile, {});
        } else {
            // No file selected or disabled state
            if (fileStatus) {
                fileStatus.textContent = 'No file selected';
                fileStatus.className = 'file-status';
            }
            
            if (fileInfoElement) {
                fileInfoElement.innerHTML = '<div>No file selected</div>';
            }
        }
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

    /**
     * Updates the file information display with enhanced UI/UX
     * @param {File} file - The file object containing file metadata
     * @param {Object} csvData - Object containing CSV data including headers and records
     */
    updateFileInfo(file, csvData = {}) {
        try {
            const fileInfoElement = document.getElementById('selected-file-info');
            if (!fileInfoElement) {
                console.warn('File info element not found');
                return;
            }

            // Default values for CSV data
            const { 
                header = [], 
                firstFewRecords = [],
                totalRecords = 0
            } = csvData;

            // Format file size with appropriate units
            const formatFileSize = (bytes) => {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };

            // Format date in a user-friendly way
            const formatDate = (timestamp) => {
                return new Date(timestamp).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            };

            // Get file extension
            const getFileExtension = (filename) => {
                const parts = filename.split('.');
                return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
            };

            // Build the file info HTML
            let fileInfoHTML = `
                <div class="file-info">
                    <div class="file-header">
                        <div class="file-icon">
                            <i class="fas fa-file-csv"></i>
                            <span class="file-extension">${getFileExtension(file.name)}</span>
                        </div>
                        <div class="file-title">
                            <h4 class="file-name" title="${file.name}">${file.name}</h4>
                            <div class="file-meta">
                                <span class="file-size">${formatFileSize(file.size)}</span>
                                <span class="file-modified">Modified: ${formatDate(file.lastModified)}</span>
                            </div>
                        </div>
                    </div>`;

            // Add record count if available
            if (totalRecords > 0 || firstFewRecords.length > 0) {
                const recordCount = totalRecords || firstFewRecords.length;
                fileInfoHTML += `
                    <div class="file-stats">
                        <div class="stat-item">
                            <i class="fas fa-list-ol"></i>
                            <span>${recordCount} record${recordCount !== 1 ? 's' : ''}</span>
                        </div>`;
                
                if (header.length > 0) {
                    fileInfoHTML += `
                        <div class="stat-item">
                            <i class="fas fa-columns"></i>
                            <span>${header.length} column${header.length !== 1 ? 's' : ''}</span>
                        </div>`;
                }
                
                fileInfoHTML += `
                    </div>`;
            }

            // Add CSV preview if we have data
            if (header.length > 0 && firstFewRecords.length > 0) {
                fileInfoHTML += `
                    <div class="file-preview">
                        <div class="preview-header">
                            <span>Data Preview</span>
                            <button class="btn-view-full" onclick="mainPage.showFullFileContent()">
                                <i class="fas fa-expand"></i> View Full
                            </button>
                        </div>
                        <div class="preview-table-container">
                            <table class="preview-table">
                                <thead>
                                    <tr>${header.map(h => `<th>${h}</th>`).join('')}</tr>
                                </thead>
                                <tbody>
                                    ${firstFewRecords.slice(0, 5).map(record => `
                                        <tr>${header.map(h => `<td>${record[h] || ''}</td>`).join('')}</tr>
                                    `).join('')}
                                </tbody>
                            </table>
                            ${firstFewRecords.length > 5 ? 
                                `<div class="preview-more">+ ${firstFewRecords.length - 5} more rows</div>` : ''}
                        </div>
                    </div>`;
            }

            fileInfoHTML += `
                </div>`; // Close file-info

            // Update the DOM
            fileInfoElement.innerHTML = fileInfoHTML;

            // Store the full file data for later use
            if (file && csvData) {
                this.currentFile = file;
                this.currentFileInfo = { ...csvData, file };
            }

            // Add event listeners for the buttons after the DOM is updated
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
            console.error('Error updating file info:', error);
            const fileInfoElement = document.getElementById('selected-file-info');
            if (fileInfoElement) {
                fileInfoElement.innerHTML = `
                    <div class="file-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Error displaying file information: ${error.message || 'Unknown error'}</span>
                    </div>`;
            }
            utils.showErrorMessage(`Error processing file: ${error.message || 'Unknown error'}`);
            this.clearFileSelection();
        } finally {
            // Always hide loading state
            utils.hideSpinner();
        }
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
            utils.hideSpinner();
        }
    }
    
    hideImportProgress() {
        // Legacy function - progress now handled by utils.hideSpinner()
        utils.log('hideImportProgress called (legacy)', 'debug');
    }
    
    /**
     * Reads a file as text
     * @param {File} file - The file to read
     * @returns {Promise<string>} The file content as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    }
    
    /**
     * Handles the import users operation
     */
    async importUsers() {
        if (!this.currentFile) {
            utils.showErrorMessage('No file selected');
            return;
        }
        
        try {
            this.updateOperationStatus('import', 'processing');
            utils.showSpinner('Importing users...');
            
            const fileContent = await this.readFileAsText(this.currentFile);
            const parseResult = await this.parseCSVPreview(fileContent);
            
            const credentials = utils.getSettings();
            if (!credentials || !credentials.environmentId || !credentials.clientId) {
                throw new Error('PingOne credentials not configured');
            }
            
            // Process the import
            const result = await this.processImport(parseResult.firstFewRecords, credentials);
            
            if (result.success) {
                this.updateOperationStatus('import', 'complete', `Imported ${result.processed || 0} users`);
                utils.showSuccessMessage(`Successfully imported ${result.processed || 0} users`);
            } else {
                throw new Error(result.message || 'Failed to import users');
            }
            
        } catch (error) {
            console.error('Import error:', error);
            this.updateOperationStatus('import', 'error', error.message);
            utils.showErrorMessage(`Import failed: ${error.message}`);
        } finally {
            utils.hideSpinner();
        }
    }

    /**
     * Displays a preview of the user attributes that will be modified
     * @param {Array} records - Array of user records to display
     */
    displayModifyPreview(records) {
        const previewContainer = document.getElementById('modify-preview');
        const headersRow = document.getElementById('modify-headers');
        const recordsBody = document.getElementById('modify-records');
        
        if (!previewContainer || !headersRow || !recordsBody) return;
        
        // Show the preview container
        previewContainer.classList.remove('hidden');
        
        // Clear existing content
        headersRow.innerHTML = '';
        recordsBody.innerHTML = '';
        
        if (!records || records.length === 0) {
            previewContainer.classList.add('hidden');
            return;
        }
        
        // Get all unique headers from the records
        const headers = new Set();
        records.forEach(record => {
            Object.keys(record).forEach(key => headers.add(key));
        });
        
        // Create header row
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headersRow.appendChild(th);
        });
        
        // Create data rows (limit to first 10 records for preview)
        const previewRecords = records.slice(0, 10);
        previewRecords.forEach(record => {
            const tr = document.createElement('tr');
            
            headers.forEach(header => {
                const td = document.createElement('td');
                const value = record[header] !== undefined ? record[header] : '';
                
                // Truncate long values
                if (typeof value === 'string' && value.length > 30) {
                    td.textContent = value.substring(0, 30) + '...';
                    td.title = value; // Show full value on hover
                } else if (typeof value === 'object' && value !== null) {
                    td.textContent = JSON.stringify(value);
                } else {
                    td.textContent = String(value);
                }
                
                // Highlight required fields
                if ((header === 'userId' || header === 'username') && !value) {
                    td.style.color = 'var(--text-error)';
                    td.style.fontWeight = 'bold';
                }
                
                tr.appendChild(td);
            });
            
            recordsBody.appendChild(tr);
        });
        
        // Update record count
        const recordCount = records.length;
        const previewCount = Math.min(10, recordCount);
        const moreCount = recordCount > 10 ? ` (showing ${previewCount} of ${recordCount})` : '';
        
        // Update pagination info
        const pageInfo = document.getElementById('modify-page-info');
        if (pageInfo) {
            pageInfo.textContent = `Page 1${moreCount}`;
        }
        
        // Disable pagination buttons for now
        const prevBtn = document.getElementById('modify-prev-page');
        const nextBtn = document.getElementById('modify-next-page');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = recordCount <= 10;
    }
    
    /**
     * Handles the modify users operation
     */
    async modifyUsers() {
        if (!this.currentFile) {
            utils.showErrorMessage('No file selected');
            return;
        }
        
        try {
            this.updateOperationStatus('modify', 'processing');
            utils.showSpinner('Processing file...');
            
            // Read and parse the file
            const fileContent = await this.readFileAsText(this.currentFile);
            const parseResult = await this.parseCSVPreview(fileContent);
            
            if (!parseResult || !parseResult.firstFewRecords || parseResult.firstFewRecords.length === 0) {
                throw new Error('No valid records found in the file');
            }
            
            // Display the preview of the data
            this.displayModifyPreview(parseResult.firstFewRecords);
            
            // Ask for confirmation before proceeding
            const confirmed = await utils.showConfirmation(
                'Confirm User Modification',
                `You are about to modify ${parseResult.firstFewRecords.length} user(s). Do you want to continue?`,
                { confirmText: 'Yes, Modify Users', cancelText: 'Cancel' }
            );
            
            if (!confirmed) {
                this.updateOperationStatus('modify', 'cancelled', 'Operation cancelled by user');
                return;
            }
            
            // Proceed with the modification
            utils.showSpinner('Modifying users...');
            
            const credentials = utils.getSettings();
            if (!credentials || !credentials.environmentId || !credentials.clientId) {
                throw new Error('PingOne credentials not configured');
            }
            
            // Process the modification
            const result = await this.processModify(parseResult.firstFewRecords, credentials);
            
            if (result.success) {
                const message = `Successfully modified ${result.processed || 0} user(s)`;
                this.updateOperationStatus('modify', 'complete', message);
                utils.showSuccessMessage(message);
            } else {
                throw new Error(result.message || 'Failed to modify users');
            }
            
        } catch (error) {
            console.error('Modify error:', error);
            this.updateOperationStatus('modify', 'error', error.message);
            utils.showErrorMessage(`Modify failed: ${error.message}`);
        } finally {
            utils.hideSpinner();
        }
    }
    
    /**
     * Handles the delete users operation
     */
    async deleteUsers() {
        if (!this.currentFile) {
            utils.showErrorMessage('No file selected');
            return;
        }
        
        try {
            this.updateOperationStatus('delete', 'processing');
            utils.showSpinner('Deleting users...');
            
            const fileContent = await this.readFileAsText(this.currentFile);
            const parseResult = await this.parseCSVPreview(fileContent);
            
            const credentials = utils.getSettings();
            if (!credentials || !credentials.environmentId || !credentials.clientId) {
                throw new Error('PingOne credentials not configured');
            }
            
            // Process the deletion
            const result = await this.processDelete(parseResult.firstFewRecords, credentials);
            
            if (result.success) {
                this.updateOperationStatus('delete', 'complete', `Deleted ${result.processed || 0} users`);
                utils.showSuccessMessage(`Successfully deleted ${result.processed || 0} users`);
            } else {
                throw new Error(result.message || 'Failed to delete users');
            }
            
        } catch (error) {
            console.error('Delete error:', error);
            this.updateOperationStatus('delete', 'error', error.message);
            utils.showErrorMessage(`Delete failed: ${error.message}`);
        } finally {
            utils.hideSpinner();
        }
    }
    
    /**
     * Processes the deletion of user records
     * @param {Array} records - Array of user records to delete
     * @param {Object} credentials - Authentication credentials
     * @returns {Promise<Object>} Result of the delete operation
     */
    async processDelete(records, credentials) {
        // Process bulk user deletion
        const startTime = Date.now();
        
        try {
            // Prepare the payload with userIds from usernames
            const userIds = records.map(record => record.username).filter(Boolean);
            
            // Show spinner
            utils.showSpinner('Deleting users...', {
                title: 'Deleting Users',
                total: userIds.length
            });
            
            const payload = {
                userIds: userIds,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            };
            
            // Log the request (without sensitive data)
            utils.log('Sending delete request', 'info', {
                recordCount: userIds.length,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: 'REDACTED',
                firstFewUserIds: userIds.slice(0, 3)
            });
            
            // Make the API call
            const response = await fetch('/api/delete/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Handle non-OK responses
            if (!response.ok) {
                const errorText = await response.text();
                utils.log('Delete API error response', 'error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText
                });
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Parse the successful response
            const result = await response.json();
            
            // Log the successful operation
            utils.log('Delete operation completed', 'info', {
                total: result.summary?.total || 0,
                successful: result.summary?.successful || 0,
                failed: result.summary?.failed || 0,
                durationMs: Date.now() - startTime
            });
            
            // Return the result in the expected format
            return {
                success: true,
                processed: result.summary?.successful || 0,
                failed: result.summary?.failed || 0,
                message: `Successfully processed ${result.summary?.successful || 0} users` + 
                        (result.summary?.failed ? ` (${result.summary.failed} failed)` : '')
            };
            
        } catch (error) {
            console.error('Delete processing error:', error);
            utils.log('Delete operation failed', 'error', {
                error: error.message,
                stack: error.stack
            });
            
            // Re-throw the error to be handled by the caller
            throw error;
        } finally {
            // Always hide the spinner when done
            // Clean up resources
            if (utils.currentOperationController) {
                // Don't abort here as it might be in use by other operations
                utils.currentOperationController = null;
            }
        }
    }
    
    /**
     * Processes the import of user records
     * @param {Array} records - Array of user records to import
     * @param {Object} credentials - Authentication credentials
     * @returns {Promise<Object>} Result of the import operation
     */
    async processImport(records, credentials) {
        // Process bulk user import with real-time progress
        const startTime = Date.now();
        let operationId = null;
        let progressEventSource = null;
        
        try {
            // Initialize operation controller if it doesn't exist
            if (!utils.currentOperationController) {
                utils.currentOperationController = new AbortController();
            }
            
            // Prepare the payload with user records
            const payload = {
                records: records,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            };
            
            // Initialize the spinner with total records count
            utils.showSpinner('Preparing import operation...', {
                title: 'Importing Users',
                total: records.length
            });
            
            // Update status to show we're making the API call
            utils.updateSpinnerTitle('Sending Import Request');
            utils.showSpinner('Sending request to server...');
            
            const response = await fetch('/api/import/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: utils.currentOperationController?.signal || null
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
            operationId = result.operationId;
            
            if (!operationId) {
                throw new Error('No operation ID returned from server');
            }
            
            // Update status to show we're connecting to progress updates
            utils.updateSpinnerTitle('Import in Progress');
            utils.showSpinner('Connecting to progress updates...');
            
            // Set up progress tracking
            let processed = 0;
            let successCount = 0;
            let errorCount = 0;
            
            // Connect to SSE for real-time progress updates
            return new Promise((resolve, reject) => {
                const TIMEOUT_MS = 300000; // 5 minutes
                const progressUrl = `/api/progress/${operationId}`;
                
                // Set up timeout
                const timeoutId = setTimeout(() => {
                    if (progressEventSource) progressEventSource.close();
                    reject(new Error('Operation timed out after 5 minutes'));
                }, TIMEOUT_MS);
                
                // Set up SSE connection for progress updates
                progressEventSource = new EventSource(progressUrl);
                
                progressEventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Update progress counters
                        if (data.type === 'progress') {
                            processed = data.processed || 0;
                            successCount = data.success || 0;
                            errorCount = data.errors || 0;
                            
                            // Calculate progress percentage
                            const progress = Math.min(100, Math.round((processed / records.length) * 100));
                            
                            // Update UI
                            utils.updateSpinnerProgress(progress);
                            utils.updateSpinnerCounters({
                                success: successCount,
                                failed: errorCount,
                                skipped: 0
                            });
                            
                            // Show current status
                            const status = `Processing record ${processed} of ${records.length} (${progress}%)`;
                            utils.showSpinner(status);
                            
                            // Log detailed progress
                            if (data.message) {
                                utils.addSpinnerDetails(`${data.status}: ${data.message}`);
                            }
                            
                            // Check if operation is complete
                            if (data.complete) {
                                clearTimeout(timeoutId);
                                progressEventSource.close();
                                
                                const duration = Date.now() - startTime;
                                const durationSec = (duration / 1000).toFixed(1);
                                
                                utils.log('Import operation completed', 'info', {
                                    operationId,
                                    durationMs: duration,
                                    recordsProcessed: processed,
                                    success: successCount,
                                    errors: errorCount
                                });
                                
                                // Show completion message
                                utils.updateSpinnerTitle('Import Complete');
                                utils.showSpinner(`Processed ${processed} records in ${durationSec} seconds`);
                                
                                // Auto-close after delay
                                setTimeout(() => {
                                    utils.hideSpinner();
                                    resolve({
                                        success: errorCount === 0,
                                        processed,
                                        successCount,
                                        errorCount,
                                        duration
                                    });
                                }, 2000);
                            }
                        }
                    } catch (error) {
                        console.error('Error processing progress update:', error);
                    }
                };
                
                progressEventSource.onerror = (error) => {
                    console.error('SSE error:', error);
                    clearTimeout(timeoutId);
                    progressEventSource.close();
                    reject(new Error('Connection to progress updates failed'));
                };
            });
            
        } catch (error) {
            console.error('Import processing error:', error);
            utils.log('Import operation failed', 'error', {
                operationId,
                error: error.message,
                stack: error.stack
            });
            
            // Update UI with error
            utils.updateSpinnerTitle('Import Failed');
            utils.showSpinner(`Error: ${error.message}`);
            
            // Auto-close after delay
            setTimeout(() => {
                utils.hideSpinner();
            }, 5000);
            
            throw error;
            
        } finally {
            // Clean up resources
            if (progressEventSource) {
                progressEventSource.close();
            }
            
            if (utils && utils.currentOperationController) {
                // Don't abort here as it might be in use by other operations
                utils.currentOperationController = null;
            }
        }
    }

    /**
     * Parses CSV content for preview display
     * @param {string} content - The CSV content to parse
     * @returns {Object} Object containing header and first few records
     */
    async parseCSVPreview(content) {
        try {
            if (!content || typeof content !== 'string') {
                throw new Error('Invalid CSV content');
            }

            // Parse CSV content
            const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length === 0) {
                throw new Error('Empty CSV file');
            }

            // Extract header row
            const header = [];
            let inHeaderQuotes = false;
            let currentHeader = [];
            
            // Parse header with proper quote handling
            for (let i = 0; i < lines[0].length; i++) {
                const char = lines[0][i];
                
                if (char === '"') {
                    inHeaderQuotes = !inHeaderQuotes;
                } else if (char === ',' && !inHeaderQuotes) {
                    header.push(currentHeader.join('').trim().replace(/^"|"$/g, ''));
                    currentHeader = [];
                } else {
                    currentHeader.push(char);
                }
            }
            // Add the last header field
            if (currentHeader.length > 0 || lines[0].endsWith(',')) {
                header.push(currentHeader.join('').trim().replace(/^"|"$/g, ''));
            }

            // Process data rows
            const firstFewRecords = [];
            const maxPreviewRows = 5;

            for (let i = 1; i < Math.min(lines.length, maxPreviewRows + 1); i++) {
                const line = lines[i];
                if (!line || line.trim() === '') continue;

                // Handle quoted values that might contain commas
                const values = [];
                let inQuotes = false;
                let currentValue = [];
                
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        values.push(currentValue.join('').trim().replace(/^"|"$/g, ''));
                        currentValue = [];
                    } else {
                        currentValue.push(char);
                    }
                }
                
                // Add the last value
                if (currentValue.length > 0 || line.endsWith(',')) {
                    values.push(currentValue.join('').trim().replace(/^"|"$/g, ''));
                }
                
                // Create record object
                const record = {};
                header.forEach((key, index) => {
                    record[key] = values[index] || '';
                });
                
                firstFewRecords.push(record);
            }

            return {
                header,
                firstFewRecords,
                totalRecords: lines.length - 1 // Subtract 1 for header
            };
        } catch (error) {
            console.error('Error parsing CSV preview:', error);
            throw new Error(`Failed to parse CSV: ${error.message}`);
        }
    }

    /**
     * Updates the status of an operation in the UI
     * @param {string} operation - The operation type ('import', 'modify', 'delete')
     * @param {string} status - The status to set ('ready', 'processing', 'complete', 'error')
     * @param {string} [message] - Optional status message
     */
    updateOperationStatus(operation, status, message = '') {
        try {
            const statusElement = document.getElementById(`${operation}-status`);
            const buttonElement = document.getElementById(`${operation}-btn`);
            
            if (!statusElement || !buttonElement) return;

            // Update status class
            statusElement.className = `status-badge ${status}`;
            
            // Update status text and button state
            switch (status) {
                case 'ready':
                    statusElement.textContent = 'Ready';
                    buttonElement.disabled = false;
                    break;
                case 'processing':
                    statusElement.textContent = 'Processing...';
                    buttonElement.disabled = true;
                    break;
                case 'complete':
                    statusElement.textContent = 'Complete' + (message ? `: ${message}` : '');
                    buttonElement.disabled = false;
                    break;
                case 'error':
                    statusElement.textContent = 'Error' + (message ? `: ${message}` : '');
                    buttonElement.disabled = false;
                    break;
                default:
                    statusElement.textContent = status;
            }
            
            // Update button text based on status
            if (status === 'complete' || status === 'error') {
                // Reset button after delay
                setTimeout(() => {
                    statusElement.textContent = 'Ready';
                    statusElement.className = 'status-badge ready';
                }, 5000);
            }
            
        } catch (error) {
            console.error('Error updating operation status:', error);
        }
    }
    
    /**
     * Converts an array of records to CSV format
     * @param {Array} records - Array of record objects
     * @returns {string} CSV formatted string
     */
    convertToCSV(records) {
        if (!records || records.length === 0) return '';
        
        // Get headers from the first record
        const headers = Object.keys(records[0] || {});
        
        // Create CSV content
        const csvRows = [
            headers.join(','), // header row
            ...records.map(record => 
                headers.map(fieldName => {
                    const value = record[fieldName] || '';
                    // Escape quotes and wrap in quotes if needed
                    const escaped = String(value).replace(/"/g, '""');
                    return `"${escaped}"`;
                }).join(',')
            )
        ];
        
        return csvRows.join('\n');
    }

    /**
     * Processes the import of user records
     * @param {Array} records - Array of user records to import
     * @param {Object} credentials - Authentication credentials
     * @returns {Promise<Object>} Result of the import operation
     */
    async processImport(records, credentials) {
        // Process bulk user import with real-time progress
        // DEBUG: Check server logs for detailed PingOne API responses
        const startTime = Date.now();
        
        try {
            // Initialize operation controller if it doesn't exist
            if (!utils.currentOperationController) {
                utils.currentOperationController = new AbortController();
            }
            
            // Update status to show we're making the API call
            utils.showSpinner('Preparing import data...');
            
            // Create FormData object for file upload
            const formData = new FormData();
            
            // Convert records to CSV content
            const csvContent = this.convertToCSV(records);
            
            // Create a Blob with proper BOM for Excel compatibility
            const blob = new Blob([
                '\uFEFF', // UTF-8 BOM for Excel
                csvContent
            ], { type: 'text/csv;charset=utf-8;' });
            
            // Create a File from the Blob
            const filename = `users_${Date.now()}.csv`;
            const file = new File([blob], filename, { type: 'text/csv;charset=utf-8;' });
            
            // Append the file to form data
            formData.append('file', file, filename);
            
            // Add other data as form fields
            formData.append('environmentId', credentials.environmentId);
            formData.append('clientId', credentials.clientId);
            formData.append('clientSecret', credentials.clientSecret);
            
            // Log the request (without sensitive data)
            utils.log('Sending import request', 'info', {
                recordCount: records.length,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: 'REDACTED',
                filename: filename
            });
            
            // Update status to show we're making the API call
            utils.showSpinner('Sending import request to server...');
            
            const response = await fetch('/api/import/bulk', {
                method: 'POST',
                body: formData,
                signal: utils.currentOperationController?.signal || null
                // Don't set Content-Type header - let the browser set it with the boundary
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
            utils.showSpinner('Connecting to progress updates...');
            
            // Connect to SSE for real-time progress updates
            if (result.operationId) {
                utils.connectToProgress(result.operationId, 'import');
            }
            
            // Wait for operation to complete (spinner hidden)
            await new Promise((resolve) => {
                const TIMEOUT_MS = 300000; // 5 minutes
                const POLL_INTERVAL = 100; // Check every 100ms
                let elapsed = 0;
                
                const checkComplete = () => {
                    const spinner = document.getElementById('spinner-overlay');
                    if (spinner && spinner.classList.contains('hidden')) {
                        resolve();
                    } else if (elapsed >= TIMEOUT_MS) {
                        throw new Error('Operation timed out after 5 minutes');
                    } else {
                        elapsed += POLL_INTERVAL;
                        setTimeout(checkComplete, POLL_INTERVAL);
                    }
                };
                
                checkComplete();
            });
            
            const duration = Date.now() - startTime;
            
            utils.log('Import operation completed', 'info', {
                operationId: result.operationId,
                durationMs: duration,
                recordsProcessed: records.length
            });
            
            return {
                ...result,
                duration
            };
        } catch (error) {
            console.error('Import processing error:', error);
            utils.log('Import operation failed', 'error', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            // Clean up the controller
            if (utils.currentOperationController) {
                // Don't abort here as it might be in use by other operations
                // Just null it out to be recreated on next operation
                utils.currentOperationController = null;
            }
        }
    }

    async processModify(records, credentials) {
        const startTime = Date.now();
        
        try {
            // Initialize operation controller if it doesn't exist
            if (!utils.currentOperationController) {
                utils.currentOperationController = new AbortController();
            }
            
            // Update status to show we're making the API call
            utils.showSpinner('Sending modify request to server...');
            
            const payload = {
                users: records,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            };
            
            // Log the request (without sensitive data)
            utils.log('Sending modify request', 'info', {
                recordCount: records.length,
                environmentId: credentials.environmentId,
                clientId: credentials.clientId,
                clientSecret: 'REDACTED'
            });
            
            const response = await fetch('/api/modify/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: utils.currentOperationController?.signal || null
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
            utils.showSpinner('Connecting to progress updates...');
            
            // Connect to SSE for real-time progress updates
            if (result.operationId) {
                utils.connectToProgress(result.operationId, 'modify');
            }
            
            // Wait for operation to complete (spinner hidden)
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 300000); // 5 minute timeout
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
        } finally {
            // Clean up the controller
            if (utils.currentOperationController) {
                utils.currentOperationController = null;
            }
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

// Initialize main page when all dependencies are loaded
const initializeApp = async function() {
    try {
        console.log('Starting application initialization...');
        
        // Wait for required dependencies
        await waitForDependencies();
        
        // Initialize utils if not already done
        if (window.utils && typeof window.utils.init === 'function') {
            await window.utils.init();
        }
        
        // Initialize main application
        window.mainPage = new MainPage();
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        
        // Show error message to user
        const errorMessage = error.message || 'An unknown error occurred during initialization';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.innerHTML = `
            <strong>Initialization Error</strong>
            <p>${errorMessage}</p>
            <p>Please check the console for more details and refresh the page to try again.</p>
        `;
        
        // Add to page
        const content = document.querySelector('.main-content') || document.body;
        content.prepend(errorDiv);
    }
}

// Wait for all required dependencies to be available
async function waitForDependencies() {
    const MAX_RETRIES = 30; // 3 seconds total wait time (100ms * 30)
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
        if (window.utils && window.axios && window.tippy && window.MainPage) {
            return true; // All dependencies loaded
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
        
        if (retries % 10 === 0) { // Log every second
            console.log('Waiting for dependencies to load...', {
                utils: !!window.utils,
                axios: !!window.axios,
                tippy: !!window.tippy,
                MainPage: !!window.MainPage
            });
        }
    }
    
    throw new Error('Timed out waiting for required dependencies to load');
}

// Export MainPage to global scope
if (typeof window !== 'undefined') {
    window.MainPage = MainPage;
    console.log('MainPage class exported to window.MainPage');
}

// Start the application when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        waitForDependencies().then(initializeApp).catch(console.error);
    });
} else {
    // DOMContentLoaded has already fired
    waitForDependencies().then(initializeApp).catch(console.error);
}
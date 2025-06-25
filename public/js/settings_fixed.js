// Settings page functionality for Ping Identity User Management

class SettingsPage {
    constructor() {
        // Only initialize if we're on the settings page
        if (this.isSettingsPage()) {
            this.defaultFileName = null; // Store the selected file name
            this.init();
        }
    }

    isSettingsPage() {
        // Check if we're on the settings page by looking for settings-specific elements
        return document.getElementById('environment-id') !== null;
    }

    async init() {
        console.log('SettingsPage.init() started');
        await this.waitForUtils();
        console.log('Utils are available');
        await this.waitForDOM();
        console.log('DOM is ready');
        await this.waitForTippy();
        console.log('Tippy.js is available');
        this.setupEventListeners();
        this.setupModifyFields();
        
        try {
            await this.loadSettings();
            this.startTokenStatusCheck();
            this.initializeTooltips();
            this.updateDefaultFileDisplay();
            utils.log('Settings page initialized', 'info');
            console.log('SettingsPage.init() finished');
        } catch (error) {
            console.error('Error initializing settings page:', error);
            utils.log('Error initializing settings: ' + error.message, 'error');
        }
    }

    async waitForUtils() {
        // Ensure utils is available and has the required methods
        while (!window.utils || typeof window.utils.getSettings !== 'function') {
            console.log('Waiting for utils to be fully initialized...');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('Utils is fully initialized');
    }

    async waitForDOM() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        // Additional wait to ensure all elements are available
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    async waitForTippy() {
        // Wait for Tippy.js to be available
        while (typeof window.tippy === 'undefined') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    initializeTooltips() {
        // Initialize Tippy.js tooltips for all elements with data-tippy-content
        const tooltipElements = document.querySelectorAll('[data-tippy-content]');
        tooltipElements.forEach(element => {
            if (typeof window.tippy !== 'undefined') {
                tippy(element, {
                    content: element.getAttribute('data-tippy-content'),
                    placement: 'top',
                    arrow: true,
                    theme: 'light',
                    animation: 'scale',
                    duration: [200, 150],
                    maxWidth: 250
                });
            }
        });
    }

    setupEventListeners() {
        // Auto-save form inputs
        const form = document.getElementById('credentials-form');
        if (form) {
            // Auto-save on input change for text fields
            form.querySelectorAll('input[type="text"], input[type="password"], input[type="url"]').forEach(input => {
                input.addEventListener('change', () => this.saveSetting(input.name, input.value));
                input.addEventListener('blur', () => this.saveSetting(input.name, input.value));
            });
            
            // Auto-save on change for checkboxes
            form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => this.saveSetting(checkbox.name, checkbox.checked));
            });
        }
        
        // File input handling
        document.getElementById('default-file')?.addEventListener('change', (e) => this.handleDefaultFileSelect(e));
        document.getElementById('toggle-secret')?.addEventListener('click', () => this.toggleSecretVisibility());
        
        // Test credentials button
        document.getElementById('test-credentials')?.addEventListener('click', () => this.testCredentials());
        
        // Sidebar Quick Actions
        this.setupSidebarNavigation();
        
        // Mobile menu toggle
        this.setupMobileMenu();
        
        // Logging listeners
        document.getElementById('start-logging-btn')?.addEventListener('click', () => this.startLogging());
        document.getElementById('stop-logging-btn')?.addEventListener('click', () => this.stopLogging());
        document.getElementById('export-log-btn')?.addEventListener('click', () => this.exportLog());
        document.getElementById('clear-log-btn')?.addEventListener('click', () => this.clearLog());
        
        // Auto-save log file name changes
        const logFileNameInput = document.getElementById('log-file-name');
        if (logFileNameInput) {
            logFileNameInput.addEventListener('change', (e) => this.updateLogConfig(e));
            logFileNameInput.addEventListener('blur', (e) => this.updateLogConfig(e));
        }
        
        // User attributes checkboxes
        const modifyFieldsGrid = document.getElementById('modify-fields-grid');
        if (modifyFieldsGrid) {
            modifyFieldsGrid.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"]')) {
                    this.saveUserAttributes();
                }
            });
        }
        
        // Handle select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-modify-fields');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                this.toggleAllModifyFields(e.target.checked);
                this.saveUserAttributes();
            });
        }
        
        // Advanced section toggle
        const advancedHeader = document.getElementById('advanced-header');
        if (advancedHeader) {
            advancedHeader.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleAdvancedSection(event);
            });
        }
    }

    setupSidebarNavigation() {
        // Quick Actions dropdown toggle
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

        // Quick action navigation (links to main page)
        document.querySelectorAll('.quick-action').forEach(action => {
            action.addEventListener('click', (e) => {
                // These will navigate to the main page, so no special handling needed
                // The browser will handle the navigation to index.html#section
            });
        });
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

    setupMobileMenu() {
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

    toggleSecretVisibility() {
        const secretInput = document.getElementById('client-secret');
        const icon = document.getElementById('toggle-secret');
        if (secretInput.type === 'password') {
            secretInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            secretInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    async loadSettings() {
        try {
            // Ensure utils is fully initialized
            await this.waitForUtils();
            
            // Now it's safe to use utils.getSettings
            const settings = utils.getSettings() || {};
            
            // Load default file if exists
            if (settings.defaultFile) {
                this.updateDefaultFileDisplay(settings.defaultFile);
                
                // Try to restore the file input value
                const fileInput = document.getElementById('default-file');
                if (fileInput) {
                    // Create a fake File object for the input
                    const file = new File(
                        [settings.defaultFile.content || ''],
                        settings.defaultFile.name,
                        {
                            type: settings.defaultFile.type || 'text/csv',
                            lastModified: settings.defaultFile.lastModified || Date.now()
                        }
                    );
                    
                    // Create a DataTransfer to set the file
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    // Set the files on the input
                    fileInput.files = dataTransfer.files;
                    
                    // Update the file reference
                    this.defaultFileName = file.name;
                }
            }
            
            // Credentials - with null checks
            const envIdEl = document.getElementById('environment-id');
            const clientIdEl = document.getElementById('client-id');
            const clientSecretEl = document.getElementById('client-secret');
            const baseUrlEl = document.getElementById('base-url');
            const saveCredentialsEl = document.getElementById('save-credentials');
            const useClientSecretEl = document.getElementById('use-client-secret');

            if (envIdEl) envIdEl.value = settings.environmentId || '';
            if (clientIdEl) clientIdEl.value = settings.clientId || '';
            if (clientSecretEl) clientSecretEl.value = settings.clientSecret || '';
            if (baseUrlEl) baseUrlEl.value = settings.baseUrl || 'https://api.pingone.com';
            if (saveCredentialsEl) saveCredentialsEl.checked = settings.saveCredentials || false;
            if (useClientSecretEl) useClientSecretEl.checked = settings.useClientSecret || false;

            // App settings
            if (settings.defaultFileName) {
                this.updateDefaultFileDisplay(settings.defaultFileName);
            }

            // Modify fields
            if (settings.modifyFields && Array.isArray(settings.modifyFields)) {
                const allFields = document.querySelectorAll('input[name="modifyFields"]');
                allFields.forEach(checkbox => {
                    checkbox.checked = settings.modifyFields.includes(checkbox.value);
                });
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async saveAllSettings() {
        const saveBtn = document.getElementById('save-all-settings');
        try {
            const environmentId = document.getElementById('environment-id').value.trim();
            const clientId = document.getElementById('client-id').value.trim();
            const baseUrl = document.getElementById('base-url').value.trim();
            const saveCredentials = document.getElementById('save-credentials').checked;
            const useClientSecret = document.getElementById('use-client-secret').checked;
            const clientSecret = document.getElementById('client-secret').value.trim();
            const defaultFileName = document.getElementById('current-default-file')?.textContent || null;

            // Robust validation
            let errorMsg = '';
            if (!environmentId) errorMsg += '<li>Environment ID is required.</li>';
            if (!clientId) errorMsg += '<li>Client ID is required.</li>';
            if (!baseUrl) errorMsg += '<li>Base URL is required.</li>';
            if (useClientSecret && !clientSecret) errorMsg += '<li>Client Secret is required when "Use Client Secret" is checked.</li>';
            if (errorMsg) {
                utils.showModal(
                    'Invalid Credentials',
                    `<ul style='color:#b71c1c; font-weight:500;'>${errorMsg}</ul>`,
                    { showCancel: false, confirmText: 'OK' }
                );
                saveBtn.textContent = 'Save Failed';
                saveBtn.classList.add('error');
                setTimeout(() => {
                    saveBtn.textContent = 'Save Configuration';
                    saveBtn.classList.remove('error');
                }, 2000);
                return;
            }

            const settings = {
                environmentId,
                clientId,
                baseUrl,
                saveCredentials,
                useClientSecret,
                defaultFileName: defaultFileName || undefined
            };

            const modifyFields = Array.from(document.querySelectorAll('input[name="modifyFields"]:checked')).map(cb => cb.value);
            settings.modifyFields = modifyFields;

            if (useClientSecret) {
                settings.clientSecret = clientSecret;
            } else {
                delete settings.clientSecret;
            }
            localStorage.setItem('pingone-settings', JSON.stringify(settings));
            utils.log('All settings saved', 'info', settings);

            // Update button for visual feedback
            saveBtn.textContent = 'Saved ✓';
            saveBtn.classList.add('saved');
            setTimeout(() => {
                saveBtn.textContent = 'Save Configuration';
                saveBtn.classList.remove('saved');
            }, 2000);

        } catch (error) {
            utils.handleError(error, 'saveAllSettings');
            saveBtn.textContent = 'Save Failed';
            saveBtn.classList.add('error');
            setTimeout(() => {
                saveBtn.textContent = 'Save Configuration';
                saveBtn.classList.remove('error');
            }, 2000);
        }
    }

    async testCredentials() {
        const tokenStatusEl = document.getElementById('token-status');
        try {
            // utils.showSpinner('Testing credentials...');
            this.updateTokenStatus('loading', 'Testing...');

            const currentCreds = {
                environmentId: document.getElementById('environment-id').value,
                clientId: document.getElementById('client-id').value,
                clientSecret: document.getElementById('client-secret').value,
                useClientSecret: document.getElementById('use-client-secret').checked
            };

            if (!currentCreds.environmentId || !currentCreds.clientId) {
                throw new Error('Environment ID and Client ID are required.');
            }

            if (currentCreds.useClientSecret && !currentCreds.clientSecret) {
                throw new Error('Client Secret is required when "Use Client Secret" is checked.');
            }

            utils.log('Testing PingOne credentials', 'info', {
                environmentId: currentCreds.environmentId.substring(0, 8) + '...',
                clientId: currentCreds.clientId.substring(0, 8) + '...',
                useClientSecret: currentCreds.useClientSecret
            });

            // Use the new test endpoint for better error reporting
            const testResult = await utils.testCredentials(
                currentCreds.environmentId,
                currentCreds.clientId,
                currentCreds.clientSecret
            );

            if (testResult.success) {
                const envName = testResult.data?.environment?.name || 'Environment';
                this.updateTokenStatus('valid', `✓ Credentials are valid - ${envName}`, envName);
                utils.log(`Credentials test successful for environment ${envName} (${currentCreds.environmentId.substring(0, 8)}...)`, 'info');
                // Clear any cached token to force fresh authentication
                utils.clearTokenCache();
            } else {
                throw new Error(testResult.error || 'Unknown error during credentials test');
            }

        } catch (error) {
            const errorMessage = error.message || 'An unknown error occurred';
            this.updateTokenStatus('expired', `✗ ${errorMessage}`);
            utils.log(`Credentials test failed: ${errorMessage}`, 'error');
            // Log detailed error information
            utils.log('Credentials test failed', 'error', {
                error: errorMessage,
                environmentId: document.getElementById('environment-id').value?.substring(0, 8) + '...',
                clientId: document.getElementById('client-id').value?.substring(0, 8) + '...'
            });
        const loadingElement = document.getElementById('logging-loading');
        const startTime = Date.now();
        
        try {
            // Show loading state
            if (loadingElement) loadingElement.style.display = 'block';
            
            // Optimistically update UI
            this.updateLoggingButtons(false);
            this.updateLoggingStatus(false, 'stopping');
            
            // Try to stop logging on the server
            const response = await fetch('/api/logs/stop', { 
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest' // For CSRF protection
                }
            });
            
            // Ensure minimum loading time for better UX
            const timeElapsed = Date.now() - startTime;
            const minLoadingTime = 500; // ms
            if (timeElapsed < minLoadingTime) {
                await new Promise(resolve => setTimeout(resolve, minLoadingTime - timeElapsed));
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Server returned ${response.status}`);
            }
            
            const result = await response.json();
            
            // Update local state
            localStorage.setItem('loggingEnabled', 'false');
            this.updateLoggingButtons(false);
            this.updateLoggingStatus(false, 'inactive');
            
            // Show success message
            utils.showSuccessMessage(
                result.message || 'Logging stopped successfully',
                { timeout: 3000 }
            );
            
            console.log('Logging stopped:', result);
            return result;
            
        } catch (error) {
            console.error('Error stopping logging:', error);
            
            // Revert UI to previous state
            await this.loadLogSettings();
            
            // Show error message
            this.updateLoggingStatus(false, 'error');
            utils.showErrorMessage(
                `Failed to stop logging: ${error.message || 'Unknown error'}`,
                { timeout: 5000 }
            );
            
            throw error; // Re-throw for error boundaries
            
        } finally {
            if (loadingElement) loadingElement.style.display = 'none';
        }
    }

    /**
     * Exports the current log file for download
     * @returns {boolean} True if export was initiated, false otherwise
     */
    exportLog() {
        try {
            // This will trigger a download in the browser
            window.location.href = '/api/logs/export';
            if (window.utils && typeof window.utils.log === 'function') {
                window.utils.log('Log export initiated.', 'info');
            }
            return true;
        } catch (error) {
            console.error('Error exporting log:', error);
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage('Failed to export log file');
            }
            return false;
        }
    }

    /**
     * Clears the current log file
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    clearLog() {
        const loadingElement = document.getElementById('logging-loading');
        return new Promise(async (resolve) => {
            try {
                if (loadingElement) {
                    loadingElement.style.display = 'block';
                }
                
                const response = await fetch('/api/logs/clear', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to clear log file');
                }
                
                this.updateLoggingStatus(false, 'empty');
                if (window.utils && typeof window.utils.showSuccessMessage === 'function') {
                    window.utils.showSuccessMessage('Log file has been cleared');
                }
                resolve(true);
                
            } catch (error) {
                console.error('Error clearing log:', error);
                if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                    window.utils.showErrorMessage(error.message || 'Failed to clear log file');
                }
                resolve(false);
                
            } finally {
                if (loadingElement) {
                    loadingElement.style.display = 'none';
                }
            }
        });
    }

    /**
     * Updates the logging buttons based on the current logging state
     * @param {boolean} isLogging - Whether logging is currently active
     */
    updateLoggingButtons(isLogging) {
        try {
            const startBtn = document.getElementById('start-logging-btn');
            const stopBtn = document.getElementById('stop-logging-btn');
            
            if (!startBtn || !stopBtn) {
                console.warn('Logging buttons not found in the DOM');
                return;
            }
            
            // Update button states
            startBtn.disabled = isLogging;
            stopBtn.disabled = !isLogging;
            
            // Toggle button visibility based on logging state
            startBtn.style.display = isLogging ? 'none' : 'inline-block';
            stopBtn.style.display = isLogging ? 'inline-block' : 'none';
            
        } catch (error) {
            console.error('Error updating logging buttons:', error);
        }
    }

    /**
     * Updates the logging status display in the UI
     * @param {boolean} isLogging - Whether logging is currently active
     * @param {string} [status=null] - Optional status message to display
     */
    updateLoggingStatus(isLogging, status = null) {
        try {
            // Get all relevant DOM elements
            const statusContainer = document.getElementById('logging-status');
            const statusBadge = document.getElementById('logging-status-badge');
            const statusValue = statusContainer ? statusContainer.querySelector('.status-value') : null;
            const statusIcon = statusContainer ? statusContainer.querySelector('.status-icon') : null;
            const logFileNameEl = document.getElementById('current-log-file');
            const logFileSizeEl = document.getElementById('log-file-size');
            const logLastUpdatedEl = document.getElementById('log-last-updated');
            
            // Check if required elements exist
            if (!statusContainer || !statusBadge) {
                console.warn('Required logging status elements not found in the DOM');
                return;
            }
            
            // Determine status text and classes
            const statusInfo = this.getStatusInfo(isLogging, status);
            
            // Update status text and badge
            if (statusValue) {
                statusValue.textContent = statusInfo.text;
                statusValue.className = statusInfo.textClass;
            }
            
            // Update status icon if it exists
            if (statusIcon) {
                statusIcon.className = `fas fa-circle ${statusInfo.textClass}`;
            }
            
            // Update status badge
            statusBadge.className = `badge ${statusInfo.badgeClass}`;
            statusContainer.className = statusInfo.textClass;
            
            // Update log file info if elements exist
            if (logFileNameEl) {
                const logFileName = logFileNameEl.getAttribute('data-filename') || 'import-status.log';
                logFileNameEl.textContent = logFileName;
                logFileNameEl.title = `Log file: ${logFileName}`;
            }
            
            if (logFileSizeEl) {
                const fileSize = logFileSizeEl.getAttribute('data-size');
                logFileSizeEl.textContent = fileSize ? 
                    `${(parseInt(fileSize) / 1024).toFixed(2)} KB` : 'N/A';
            }
            
            if (logLastUpdatedEl) {
                const lastUpdated = logLastUpdatedEl.getAttribute('data-last-updated');
                logLastUpdatedEl.textContent = lastUpdated ? 
                    new Date(lastUpdated).toLocaleString() : 'N/A';
            }
            
        } catch (error) {
            console.error('Error updating logging status:', error);
            // Fallback to basic status update if there's an error
            const statusContainer = document.getElementById('logging-status');
            if (statusContainer) {
                statusContainer.textContent = isLogging ? 'Active' : 'Inactive';
                statusContainer.className = isLogging ? 'text-success' : 'text-muted';
            }
        }
    }
    
    /**
     * Gets the status information based on logging state and status
     * @private
     * @param {boolean} isLogging - Whether logging is active
     * @param {string} [status] - Current status
     * @returns {Object} Status information object with text, badgeClass, textClass, and description
     */
    getStatusInfo(isLogging, status) {
        // Initialize default result object
        const result = {
            text: isLogging ? 'Active' : 'Inactive',
            badgeClass: isLogging ? 'bg-success' : 'bg-secondary',
            textClass: isLogging ? 'text-success' : 'text-muted',
            description: isLogging ? 'Logging is active' : 'Logging is inactive'
        };

        // Override defaults based on status if provided
        if (status) {
            result.text = status.charAt(0).toUpperCase() + status.slice(1);
            
            switch (status) {
                case 'starting':
                case 'stopping':
                    result.badgeClass = 'bg-warning';
                    result.textClass = 'text-warning';
                    result.description = `Logging is being ${status}...`;
                    break;
                    
                case 'error':
                    result.badgeClass = 'bg-danger';
                    result.textClass = 'text-danger';
                    result.description = 'Error with logging service';
                    break;
                    
                case 'warning':
                    result.badgeClass = 'bg-warning';
                    result.textClass = 'text-warning';
                    result.description = 'Warning: Issue with logging service';
                    break;
                    
                case 'empty':
                    result.description = 'Log file is empty';
                    break;
                    
                // Default case: use the status as description
                default:
                    result.description = status;
            }
        }
        
        return result;
        }
    }

    setupModifyFields() {
        const fields = [
            { id: 'firstName', label: 'First Name', checked: true },
            { id: 'lastName', label: 'Last Name', checked: true },
            { id: 'email', label: 'Email', checked: true },
            { id: 'username', label: 'Username', checked: false },
            { id: 'password', label: 'Password', checked: false },
            { id: 'population', label: 'Population', checked: false },
            { id: 'active', label: 'Active', checked: true },
            { id: 'accountExpiry', label: 'Account Expiry', checked: false },
            { id: 'customAttributes', label: 'Custom Attributes', checked: false }
        ];

        const grid = document.getElementById('modify-fields-grid');
        if (!grid) return;

        // Add select all checkbox
        const selectAllHtml = `
            <div class="select-all-container">
                <label class="checkbox-label select-all">
                    <input type="checkbox" id="select-all-fields">
                    <span>Select All</span>
                </label>
            </div>
        `;
        
        // Add individual checkboxes
        const fieldsHtml = fields.map(field => `
            <label class="checkbox-label">
                <input type="checkbox" id="modify-${field.id}" name="modifyFields" value="${field.id}" ${field.checked ? 'checked' : ''}>
                <span>${field.label}</span>
                <span class="tooltip-icon" data-tippy-content="Update the ${field.label} attribute.">i</span>
            </label>
        `).join('');
        
        grid.innerHTML = selectAllHtml + fieldsHtml;
        
        // Add event listener for select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-fields');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('#modify-fields-grid input[type="checkbox"]:not(#select-all-fields)');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = e.target.checked;
                });
                this.saveUserAttributes();
            });
        }
        
        // Add change event listeners to individual checkboxes
        const checkboxes = document.querySelectorAll('#modify-fields-grid input[type="checkbox"]:not(#select-all-fields)');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.saveUserAttributes());
        });
        
        // Update select all checkbox state
        this.updateSelectAllCheckbox();
        
        this.initializeTooltips(); // Re-initialize tooltips for new elements
    }
    
    /**
     * Updates the state of the 'Select All' checkbox based on individual checkboxes
     */
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all-fields');
        if (!selectAllCheckbox) return;
        
        const checkboxes = Array.from(document.querySelectorAll('#modify-fields-grid input[type="checkbox"]:not(#select-all-fields)'));
        const allChecked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);
        const someChecked = checkboxes.some(checkbox => checkbox.checked);
        
        // Update select all checkbox state
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = !allChecked && someChecked;
    }

    toggleAllModifyFields(checked) {
        const checkboxes = document.querySelectorAll('#modify-fields-grid input[name="modifyFields"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    toggleAdvancedSection(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const advancedSection = document.querySelector('.advanced-section');
        if (advancedSection) {
            advancedSection.classList.toggle('open');
        }
    }
}

// Initialize settings page when all dependencies are loaded
async function initializeSettings() {
    try {
        console.log('Starting settings page initialization...');
        
        // Only initialize if we're on the settings page
        if (!document.getElementById('environment-id')) {
            console.log('Not on settings page, skipping initialization');
            return;
        }
        
        // Wait for required dependencies
        await waitForDependencies();
        
        // Initialize settings page
        window.settingsPage = new SettingsPage();
        console.log('Settings page initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize settings page:', error);
        
        // Show error message to user
        const errorMessage = error.message || 'An unknown error occurred while initializing the settings page';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.innerHTML = `
            <strong>Settings Error</strong>
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
        if (window.utils && window.axios && window.tippy) {
            return true; // All dependencies loaded
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    throw new Error('Timed out waiting for required dependencies to load');
}

// Start the settings page initialization when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSettings);
} else {
    // DOMContentLoaded has already fired
    initializeSettings();
}
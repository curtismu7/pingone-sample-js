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
        this.loadSettings();
        this.startTokenStatusCheck();
        this.initializeTooltips();
        this.updateDefaultFileDisplay();
        utils.log('Settings page initialized', 'info');
        console.log('SettingsPage.init() finished');
    }

    async waitForUtils() {
        while (!window.utils) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
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
        document.getElementById('advanced-header')?.addEventListener('click', () => this.toggleAdvancedSection());
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

    loadSettings() {
        try {
            const settings = utils.loadSettings() || {};
            
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
        } finally {
            // utils.hideSpinner();
        }
    }

    updateTokenStatus(status, message, envName = '') {
        const tokenStatus = document.getElementById('token-status');
        if (!tokenStatus) return;
        tokenStatus.textContent = message;
        tokenStatus.className = `token-status ${status}`;
        
        // Save token status to settings
        const settings = utils.getSettings() || {};
        settings.tokenStatus = {
            status,
            message,
            envName,
            timestamp: new Date().toISOString()
        };
        utils.saveSettings(settings);
    }

    startTokenStatusCheck() {
        this.checkTokenStatus();
        setInterval(() => this.checkTokenStatus(), 60000);
    }

    async checkTokenStatus() {
        try {
            const settings = utils.getSettings() || {};
            const credentials = utils.getStoredCredentials();
            
            // If we have a valid cached status from a recent check, use it
            if (settings.tokenStatus) {
                const statusAge = new Date() - new Date(settings.tokenStatus.timestamp);
                const maxStatusAge = 5 * 60 * 1000; // 5 minutes
                
                if (statusAge < maxStatusAge && settings.tokenStatus.status === 'valid') {
                    const message = settings.tokenStatus.envName 
                        ? `✓ Credentials are valid - ${settings.tokenStatus.envName}`
                        : '✓ Credentials are valid';
                    this.updateTokenStatus('valid', message, settings.tokenStatus.envName);
                    return;
                }
            }
            
            if (!credentials) {
                this.updateTokenStatus('expired', 'Credentials may be expired or invalid. Please test.');
                return;
            }
            
            // A simple check without forcing a token refetch
            if (utils.isTokenValid()) {
                // If we have a saved environment name, use it
                const envName = settings.tokenStatus?.envName || '';
                const message = envName 
                    ? `✓ Credentials are valid - ${envName}`
                    : '✓ Credentials appear to be valid';
                this.updateTokenStatus('valid', message, envName);
            } else {
                this.updateTokenStatus('expired', 'Credentials may be expired or invalid. Please test.');
            }
        } catch (error) {
            this.updateTokenStatus('expired', '✗ Could not verify token status.');
        }
    }

    async handleDefaultFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileInput = event.target;
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.textContent = 'Processing file...';
        fileInput.disabled = true;
        fileInput.parentNode.insertBefore(loadingText, fileInput.nextSibling);
        
        try {
            // Read file content
            const fileContent = await this.readFileAsText(file);
            
            // Create file info object with content
            const fileInfo = {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                type: file.type,
                content: fileContent
            };
            
            // Save to localStorage
            localStorage.setItem('settingsDefaultFile', JSON.stringify(fileInfo));
            
            // Update settings
            const settings = utils.getSettings() || {};
            settings.defaultFile = fileInfo;
            settings.settingsDefaultFile = fileInfo; // For backward compatibility
            utils.saveSettings(settings);
            
            // Update UI with full file info
            this.updateDefaultFileDisplay(fileInfo);
            
            // Show success message
            utils.showSuccessMessage(`Default file set: ${file.name}`);
            
            console.log(`Default file set to: ${file.name}`);
            
        } catch (error) {
            console.error('Error setting default file:', error);
            utils.showErrorMessage(`Failed to set default file: ${error.message || 'Unknown error'}`);
            fileInput.value = ''; // Reset file input on error
        } finally {
            // Clean up loading state
            fileInput.disabled = false;
            if (loadingText.parentNode) {
                loadingText.parentNode.removeChild(loadingText);
            }
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    updateDefaultFileDisplay(fileInfo) {
        const display = document.getElementById('current-default-file');
        const fileInput = document.getElementById('default-file');
        
        if (!display) return;
        
        if (fileInfo && fileInfo.name) {
            // Format file size if available
            const fileSize = fileInfo.size ? ` (${(fileInfo.size / 1024).toLocaleString(undefined, {maximumFractionDigits: 1})} KB)` : '';
            const lastModified = fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleString() : 'N/A';
            
            // Parse CSV to get row count and headers if content is available
            let rowCount = 0;
            let headers = [];
            let sampleData = [];
            
            if (fileInfo.content) {
                try {
                    const lines = fileInfo.content.split('\n').filter(line => line.trim() !== '');
                    rowCount = lines.length > 0 ? lines.length - 1 : 0; // Subtract 1 for header
                    
                    if (lines.length > 0) {
                        // Parse headers and first few rows for preview
                        headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                        
                        // Get up to 3 rows of sample data
                        const maxSampleRows = Math.min(3, lines.length - 1);
                        for (let i = 1; i <= maxSampleRows; i++) {
                            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                            const row = {};
                            headers.forEach((header, index) => {
                                row[header] = values[index] || '';
                            });
                            sampleData.push(row);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing CSV content:', e);
                }
            }
            
            // Format the file details HTML
            display.innerHTML = `
                <div class="file-display">
                    <div class="file-info">
                        <i class="fas fa-file-csv file-icon"></i>
                        <div class="file-details">
                            <div class="file-name">
                                <i class="fas fa-file-csv"></i>
                                <span>${fileInfo.name}</span>
                                <span class="file-size">${fileSize}</span>
                            </div>
                            <div class="file-meta">
                                <span class="file-meta-item">
                                    <i class="far fa-calendar-alt"></i> Modified: ${lastModified}
                                </span>
                                ${rowCount > 0 ? `
                                <span class="file-meta-item">
                                    <i class="fas fa-list-ol"></i> ${rowCount.toLocaleString()} rows
                                </span>` : ''}
                                ${headers.length > 0 ? `
                                <span class="file-meta-item">
                                    <i class="fas fa-columns"></i> ${headers.length} columns
                                </span>` : ''}
                            </div>
                            
                            ${headers.length > 0 ? `
                            <div class="file-preview">
                                <div class="preview-header">Preview:</div>
                                <div class="preview-table-container">
                                    <table class="preview-table">
                                        <thead>
                                            <tr>
                                                ${headers.map(header => 
                                                    `<th>${header}</th>`
                                                ).join('')}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${sampleData.map(row => `
                                                <tr>
                                                    ${headers.map(header => 
                                                        `<td>${row[header] || ''}</td>`
                                                    ).join('')}
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>` : ''}
                            
                            <div class="file-actions">
                                <button type="button" class="btn-clear" title="Clear file">
                                    <i class="fas fa-times"></i> Clear File
                                </button>
                                <button type="button" class="btn-view" title="View full file">
                                    <i class="fas fa-expand"></i> View Full
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            
            // Add event listeners
            const clearBtn = display.querySelector('.btn-clear');
            const viewBtn = display.querySelector('.btn-view');
            
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Clear the file input
                    if (fileInput) {
                        fileInput.value = '';
                    }
                    
                    // Clear from settings
                    this.saveSetting('defaultFile', null);
                    
                    // Update UI
                    display.innerHTML = '<div class="no-file">No file selected</div>';
                    display.classList.remove('show');
                    
                    // Show success message
                    utils.showSuccessMessage('Default file cleared');
                });
            }
            
            if (viewBtn) {
                viewBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Show a modal with the full file content
                    const modalContent = `
                        <div class="file-modal-content">
                            <h3>${fileInfo.name}</h3>
                            <div class="file-content">
                                <pre>${fileInfo.content || 'No content available'}</pre>
                            </div>
                        </div>
                    `;
                    
                    utils.showModal('File Content', modalContent, {
                        width: '90%',
                        height: '80%',
                        maxWidth: '1200px'
                    });
                });
            }
            
            display.classList.add('show');
        } else {
            display.innerHTML = '<div class="no-file">No file selected</div>';
            display.classList.remove('show');
        }
    }

    async saveSetting(key, value) {
        try {
            const settings = utils.getSettings() || {};
            settings[key] = value;
            
            // Save to localStorage for persistence
            localStorage.setItem(`setting_${key}`, JSON.stringify(value));
            
            // Save to settings
            utils.saveSettings(settings);
            
            // Special handling for certain settings
            if (key === 'logFileName') {
                await this.updateLogConfig({ target: { value } });
            }
            
            console.log(`Setting saved: ${key} =`, value);
        } catch (error) {
            console.error('Error saving setting:', error);
            utils.showErrorMessage(`Failed to save ${key}`);
        }
    }

    saveUserAttributes() {
        try {
            const checkboxes = document.querySelectorAll('#modify-fields-grid input[type="checkbox"]');
            const selectedAttrs = [];
            
            checkboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    selectedAttrs.push(checkbox.name);
                }
            });
            
            // Save to settings
            const settings = utils.getSettings() || {};
            settings.userAttributes = selectedAttrs;
            utils.saveSettings(settings);
            
            // Also save to localStorage for immediate persistence
            localStorage.setItem('userAttributes', JSON.stringify(selectedAttrs));
            
            // Update select all checkbox
            this.updateSelectAllCheckbox();
            
            console.log('User attributes saved:', selectedAttrs);
            return true;
        } catch (error) {
            console.error('Error saving user attributes:', error);
            utils.showErrorMessage('Failed to save user attributes');
            return false;
        }
    }

    async loadLogSettings() {
        try {
            const response = await fetch('/api/logs/config');
            if (!response.ok) throw new Error('Failed to fetch log config');
            const config = await response.json();
            
            // Update log file name input
            const logFileNameInput = document.getElementById('log-file-name');
            if (logFileNameInput) {
                logFileNameInput.value = config.logFile || 'import-status.log';
            }
            
            // Update logging state
            this.updateLoggingButtons(config.isLogging);
            this.updateLoggingStatus(config.isLogging);
            
            return config;
        } catch (error) {
            console.error('Error loading log settings:', error);
            utils.handleError(error, 'loadLogSettings');
            return { isLogging: false };
        }
    }

    async updateLogConfig(event) {
        const newLogFile = event.target.value;
        if (!newLogFile) return;
        try {
            await fetch('/api/logs/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logFile: newLogFile }),
            });
            console.log('Log filename updated successfully');
        } catch (error) {
            utils.handleError(error, 'updateLogConfig');
        }
    }

    async startLogging() {
        const loadingElement = document.getElementById('logging-loading');
        try {
            if (loadingElement) loadingElement.style.display = 'block';
            
            const response = await fetch('/api/logs/start', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to start logging');
            }
            
            const result = await response.json();
            this.updateLoggingButtons(true);
            this.updateLoggingStatus(true);
            utils.showSuccessMessage(result.message || 'Logging started successfully');
            console.log('File logging has been started');
            return result;
        } catch (error) {
            console.error('Error starting logging:', error);
            utils.showErrorMessage(error.message || 'Failed to start logging');
            // Re-fetch the current state to ensure UI is in sync
            await this.loadLogSettings();
            throw error;
        } finally {
            if (loadingElement) loadingElement.style.display = 'none';
        }
    }

    async stopLogging() {
        const loadingElement = document.getElementById('logging-loading');
        try {
            if (loadingElement) loadingElement.style.display = 'block';
            
            const response = await fetch('/api/logs/stop', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to stop logging');
            }
            
            const result = await response.json();
            this.updateLoggingButtons(false);
            this.updateLoggingStatus(false);
            utils.showSuccessMessage(result.message || 'Logging stopped successfully');
            console.log('File logging has been stopped');
            return result;
        } catch (error) {
            console.error('Error stopping logging:', error);
            utils.showErrorMessage(error.message || 'Failed to stop logging');
            // Re-fetch the current state to ensure UI is in sync
            await this.loadLogSettings();
            throw error;
        } finally {
            if (loadingElement) loadingElement.style.display = 'none';
        }
    }

    exportLog() {
        // This will trigger a download in the browser
        window.location.href = '/api/logs/export';
        utils.log('Log export initiated.', 'info');
    }

    async clearLog() {
        // Remove modal confirmation - just clear directly
        try {
            await fetch('/api/logs/clear', { method: 'POST' });
            this.updateLoggingStatus(false, 'empty');
            console.log('Log file has been cleared');
        } catch (error) {
            utils.handleError(error, 'clearLog');
        }
    }

    updateLoggingButtons(isLogging) {
        const startBtn = document.getElementById('start-logging-btn');
        const stopBtn = document.getElementById('stop-logging-btn');
        
        if (startBtn && stopBtn) {
            startBtn.disabled = isLogging;
            stopBtn.disabled = !isLogging;
            
            // Toggle button visibility based on logging state
            startBtn.style.display = isLogging ? 'none' : 'inline-block';
            stopBtn.style.display = isLogging ? 'inline-block' : 'none';
        }
    }

    updateLoggingStatus(isLogging, status = null) {
        const statusContainer = document.getElementById('logging-status');
        const statusValue = statusContainer?.querySelector('.status-value');
        const statusIcon = statusContainer?.querySelector('.status-icon');
        const logFileNameEl = document.getElementById('current-log-file');

        if (!statusContainer || !statusValue || !statusIcon) return;

        let currentStatus = status;
        if (!currentStatus) {
            currentStatus = isLogging ? 'active' : 'inactive';
        }

        const statusMap = {
            active: { 
                text: 'Active', 
                icon: '✓', 
                colorClass: 'active',
                description: 'Logging is currently active and recording events.'
            },
            inactive: { 
                text: 'Inactive', 
                icon: '✗', 
                colorClass: 'inactive',
                description: 'Logging is currently inactive.'
            },
            empty: { 
                text: 'Empty', 
                icon: '✓', 
                colorClass: 'empty',
                description: 'Log file is empty.'
            }
        };

        const { text, icon, colorClass, description } = statusMap[currentStatus] || statusMap.inactive;
        
        // Update status display
        statusValue.textContent = text;
        statusIcon.textContent = icon;
        statusContainer.className = 'status-display';
        statusContainer.classList.add(colorClass);
        statusContainer.title = description;
        
        // Update log file display if element exists
        if (logFileNameEl) {
            const logFileName = document.getElementById('log-file-name')?.value || 'import-status.log';
            logFileNameEl.textContent = logFileName;
            logFileNameEl.title = `Log file: ${logFileName}`;
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
            { id: 'title', label: 'Title', checked: false },
            { id: 'phoneNumbers', label: 'Phone Numbers', checked: false },
            { id: 'address', label: 'Address', checked: false },
            { id: 'locale', label: 'Locale', checked: false },
            { id: 'timezone', label: 'Timezone', checked: false },
            { id: 'externalId', label: 'External ID', checked: false },
            { id: 'type', label: 'Type', checked: false },
            { id: 'nickname', label: 'Nickname', checked: false },
        ];

        const grid = document.getElementById('modify-fields-grid');
        if (!grid) return;

        grid.innerHTML = fields.map(field => `
            <label class="checkbox-label">
                <input type="checkbox" id="modify-${field.id}" name="modifyFields" value="${field.id}" ${field.checked ? 'checked' : ''}>
                <span>${field.label}</span>
                <span class="tooltip-icon" data-tippy-content="Update the ${field.label} attribute.">i</span>
            </label>
        `).join('');
        this.initializeTooltips(); // Re-initialize tooltips for new elements
    }

    toggleAllModifyFields(checked) {
        const checkboxes = document.querySelectorAll('#modify-fields-grid input[name="modifyFields"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    toggleAdvancedSection() {
        const advancedSection = document.querySelector('.advanced-section');
        if (advancedSection) {
            advancedSection.classList.toggle('open');
        }
    }
}

// Only initialize if on settings page
if (document.getElementById('environment-id')) {
    window.settingsPage = new SettingsPage();
}
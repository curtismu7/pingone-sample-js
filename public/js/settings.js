// Settings page functionality for Ping Identity User Management

class SettingsPage {
    constructor() {
        // Only initialize if we're on the settings page
        if (this.isSettingsPage()) {
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
        document.getElementById('save-all-settings')?.addEventListener('click', () => this.saveAllSettings());
        document.getElementById('test-credentials')?.addEventListener('click', () => this.testCredentials());
        document.getElementById('default-file')?.addEventListener('change', (e) => this.handleDefaultFileSelect(e));
        document.getElementById('toggle-secret')?.addEventListener('click', () => this.toggleSecretVisibility());
        
        // Sidebar Quick Actions
        this.setupSidebarNavigation();
        
        // Mobile menu toggle
        this.setupMobileMenu();
        
        // Logging listeners
        document.getElementById('start-logging-btn')?.addEventListener('click', () => this.startLogging());
        document.getElementById('stop-logging-btn')?.addEventListener('click', () => this.stopLogging());
        document.getElementById('export-log-btn')?.addEventListener('click', () => this.exportLog());
        document.getElementById('clear-log-btn')?.addEventListener('click', () => this.clearLog());
        document.getElementById('log-file-name')?.addEventListener('change', (e) => this.updateLogConfig(e));
        document.getElementById('select-all-modify-fields')?.addEventListener('click', (e) => this.toggleAllModifyFields(e.target.checked));
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
            const settings = utils.loadSettings();
            if (settings) {
                this.populateFormFields(settings);
                utils.log('Settings loaded from storage', 'info');
                this.loadLogSettings(); // Load logging settings
            }
        } catch (error) {
            utils.handleError(error, 'loadSettings');
        }
    }

    populateFormFields(settings) {
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
                defaultFileName
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
                this.updateTokenStatus('valid', `✓ Credentials are valid - Environment: ${testResult.environment.name}`);
                utils.log(`Credentials test successful for environment ${currentCreds.environmentId.substring(0, 8)}...`, 'info');
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

    updateTokenStatus(status, message) {
        const tokenStatus = document.getElementById('token-status');
        if (!tokenStatus) return;
        tokenStatus.textContent = message;
        tokenStatus.className = `token-status ${status}`;
    }

    startTokenStatusCheck() {
        this.checkTokenStatus();
        setInterval(() => this.checkTokenStatus(), 60000);
    }

    async checkTokenStatus() {
        try {
            const credentials = utils.getStoredCredentials();
            if (!credentials) {
                this.updateTokenStatus('expired', 'Credentials may be expired or invalid. Please test.');
                return;
            }
            // A simple check without forcing a token refetch
            if (utils.isTokenValid()) {
                 this.updateTokenStatus('valid', '✓ Credentials appear to be valid.');
            } else {
                 this.updateTokenStatus('expired', 'Credentials may be expired or invalid. Please test.');
            }
        } catch (error) {
            this.updateTokenStatus('expired', '✗ Could not verify token status.');
        }
    }

    handleDefaultFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.updateDefaultFileDisplay(file.name);
            // We only store the name, not the file content itself in settings
        }
    }
    
    updateDefaultFileDisplay(fileName) {
        const display = document.getElementById('current-default-file');
        if (display) {
            if (fileName) {
                display.innerHTML = `
                    <span class="file-label">Current:</span> 
                    <span class="file-name">${fileName}</span>
                `;
                display.classList.add('show');
            } else {
                display.innerHTML = '';
                display.classList.remove('show');
            }
        }
    }

    // --- Logging Methods ---

    async loadLogSettings() {
        try {
            const response = await fetch('/api/logs/config');
            if (!response.ok) throw new Error('Failed to fetch log config');
            const config = await response.json();
            document.getElementById('log-file-name').value = config.logFile || 'import-status.log';
            this.updateLoggingButtons(config.isLogging);
            this.updateLoggingStatus(config.isLogging);
        } catch (error) {
            utils.handleError(error, 'loadLogSettings');
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
        try {
            await fetch('/api/logs/start', { method: 'POST' });
            this.updateLoggingButtons(true);
            this.updateLoggingStatus(true);
            console.log('File logging has been started');
        } catch (error) {
            utils.handleError(error, 'startLogging');
        }
    }

    async stopLogging() {
        try {
            await fetch('/api/logs/stop', { method: 'POST' });
            this.updateLoggingButtons(false);
            this.updateLoggingStatus(false);
            console.log('File logging has been stopped');
        } catch (error) {
            utils.handleError(error, 'stopLogging');
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
        if (isLogging) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    updateLoggingStatus(isLogging, status = null) {
        const statusContainer = document.getElementById('logging-status');
        const statusValue = statusContainer?.querySelector('.status-value');
        const statusIcon = statusContainer?.querySelector('.status-icon');

        if (!statusContainer || !statusValue || !statusIcon) return;

        let currentStatus = status;
        if (!currentStatus) {
            currentStatus = isLogging ? 'active' : 'inactive';
        }

        const statusMap = {
            active: { text: 'Active', icon: '✓', colorClass: 'active' },
            inactive: { text: 'Inactive', icon: '✗', colorClass: 'inactive' },
            empty: { text: 'Empty', icon: '✓', colorClass: 'empty' }
        };

        const { text, icon, colorClass } = statusMap[currentStatus] || statusMap.inactive;
        
        statusValue.textContent = text;
        statusIcon.textContent = icon;
        
        statusContainer.className = 'status-display'; // Reset classes
        statusContainer.classList.add(colorClass);
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
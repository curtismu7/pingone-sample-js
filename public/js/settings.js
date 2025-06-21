// Settings page functionality for Ping Identity User Management

class SettingsPage {
    constructor() {
        this.currentFile = null;
        this.init();
    }

    async init() {
        await this.waitForUtils();
        this.setupEventListeners();
        this.loadSettings();
        this.updatePageLanguage();
        this.startTokenStatusCheck();
        this.initializeTooltips();
        this.updateDefaultFileDisplay();
        utils.log('Settings page initialized', 'info');
    }

    async waitForUtils() {
        while (!window.utils) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    initializeTooltips() {
        // Initialize Tippy.js tooltips for all elements with data-tippy-content
        const tooltipElements = document.querySelectorAll('[data-tippy-content]');
        tooltipElements.forEach(element => {
            tippy(element, {
                content: element.getAttribute('data-tippy-content'),
                placement: 'top',
                arrow: true,
                theme: 'light',
                animation: 'scale',
                duration: [200, 150],
                maxWidth: 250
            });
        });
    }

    updateDefaultFileDisplay() {
        const defaultFileDisplay = document.getElementById('default-file-display');
        const defaultFileName = document.getElementById('default-file-name');
        
        if (this.currentFile) {
            defaultFileName.textContent = this.currentFile.name;
            defaultFileDisplay.classList.remove('hidden');
        } else {
            // Check if there's a saved default file
            const settings = this.getCurrentSettings();
            if (settings.defaultFile) {
                defaultFileName.textContent = settings.defaultFile;
                defaultFileDisplay.classList.remove('hidden');
            } else {
                defaultFileDisplay.classList.add('hidden');
            }
        }
    }

    setupEventListeners() {
        // Credentials form
        const credentialsForm = document.getElementById('credentials-form');
        if (credentialsForm) {
            credentialsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCredentials();
            });
        }

        // Test credentials button
        const testBtn = document.getElementById('test-credentials');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testCredentials());
        }

        // App settings form
        const appSettingsForm = document.getElementById('app-settings-form');
        if (appSettingsForm) {
            appSettingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAppSettings();
            });
        }

        // Default file input
        const defaultFileInput = document.getElementById('default-file');
        if (defaultFileInput) {
            defaultFileInput.addEventListener('change', (e) => this.handleDefaultFileSelect(e));
        }

        // Action buttons
        const saveSettingsBtn = document.getElementById('save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveAllSettings());
        }

        const deleteSettingsBtn = document.getElementById('delete-settings');
        if (deleteSettingsBtn) {
            deleteSettingsBtn.addEventListener('click', () => this.deleteSettings());
        }

        const resetSettingsBtn = document.getElementById('reset-settings');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }

        // Column mapping changes
        this.setupColumnMappingListeners();
    }

    setupColumnMappingListeners() {
        const columnSelects = document.querySelectorAll('.column-select');
        columnSelects.forEach(select => {
            select.addEventListener('change', () => {
                this.saveColumnMapping();
            });
        });
    }

    loadSettings() {
        try {
            const settings = localStorage.getItem('pingone-settings');
            if (settings) {
                const parsed = JSON.parse(settings);
                this.populateFormFields(parsed);
                utils.log('Settings loaded from storage', 'info');
            }
        } catch (error) {
            utils.log(`Failed to load settings: ${error.message}`, 'error');
        }
    }

    populateFormFields(settings) {
        // Credentials
        if (settings.environmentId) {
            document.getElementById('environment-id').value = settings.environmentId;
        }
        if (settings.clientId) {
            document.getElementById('client-id').value = settings.clientId;
        }
        if (settings.clientSecret) {
            document.getElementById('client-secret').value = settings.clientSecret;
        }
        if (settings.baseUrl) {
            document.getElementById('base-url').value = settings.baseUrl;
        }
        if (settings.saveCredentials !== undefined) {
            document.getElementById('save-credentials').checked = settings.saveCredentials;
        }
        if (settings.useClientSecret !== undefined) {
            document.getElementById('use-client-secret').checked = settings.useClientSecret;
        }

        // App settings
        if (settings.language) {
            document.getElementById('language').value = settings.language;
        }
        if (settings.recordsPerPage) {
            document.getElementById('records-per-page').value = settings.recordsPerPage;
        }
        if (settings.defaultFile) {
            this.updateCurrentDefaultFile(settings.defaultFile);
        }

        // Column mapping
        if (settings.usernameColumn) {
            document.getElementById('username-column').value = settings.usernameColumn;
        }
        if (settings.emailColumn) {
            document.getElementById('email-column').value = settings.emailColumn;
        }
        if (settings.firstnameColumn) {
            document.getElementById('firstname-column').value = settings.firstnameColumn;
        }
        if (settings.lastnameColumn) {
            document.getElementById('lastname-column').value = settings.lastnameColumn;
        }
        if (settings.populationColumn) {
            document.getElementById('population-column').value = settings.populationColumn;
        }
    }

    async saveCredentials() {
        try {
            const formData = new FormData(document.getElementById('credentials-form'));
            const credentials = {
                environmentId: formData.get('environmentId'),
                clientId: formData.get('clientId'),
                clientSecret: formData.get('clientSecret'),
                baseUrl: formData.get('baseUrl'),
                saveCredentials: formData.get('saveCredentials') === 'on',
                useClientSecret: formData.get('useClientSecret') === 'on'
            };

            // Validate required fields
            if (!credentials.environmentId || !credentials.clientId || !credentials.clientSecret) {
                throw new Error('Environment ID, Client ID, and Client Secret are required');
            }

            // Save to localStorage
            const currentSettings = this.getCurrentSettings();
            const updatedSettings = { ...currentSettings, ...credentials };
            
            if (credentials.saveCredentials) {
                localStorage.setItem('pingone-settings', JSON.stringify(updatedSettings));
                utils.log('Credentials saved', 'info');
            } else {
                // Clear sensitive data if not saving
                delete updatedSettings.clientSecret;
                localStorage.setItem('pingone-settings', JSON.stringify(updatedSettings));
                utils.log('Credentials validated but not saved', 'info');
            }

            // Clear token cache to force new token
            utils.clearTokenCache();

            utils.showModal(
                'Credentials Saved',
                'Your credentials have been successfully saved and validated.',
                { confirmText: 'OK', showCancel: false }
            );

        } catch (error) {
            utils.handleError(error, 'saveCredentials');
        }
    }

    async testCredentials() {
        try {
            const formData = new FormData(document.getElementById('credentials-form'));
            const credentials = {
                environmentId: formData.get('environmentId'),
                clientId: formData.get('clientId'),
                clientSecret: formData.get('clientSecret'),
                baseUrl: formData.get('baseUrl') || 'https://api.pingone.com'
            };

            if (!credentials.environmentId || !credentials.clientId || !credentials.clientSecret) {
                throw new Error('Environment ID, Client ID, and Client Secret are required');
            }

            utils.showSpinner('Testing credentials...');
            this.updateTokenStatus('loading', 'Testing credentials...');

            // Test by getting a worker token
            const token = await utils.getWorkerToken(
                credentials.environmentId,
                credentials.clientId,
                credentials.clientSecret
            );

            if (token) {
                this.updateTokenStatus('valid', 'Credentials are valid');
                utils.log('Credentials test successful', 'info');
            } else {
                throw new Error('Failed to obtain token');
            }

        } catch (error) {
            this.updateTokenStatus('expired', 'Credentials are invalid');
            utils.log(`Credentials test failed: ${error.message}`, 'error');
        } finally {
            utils.hideSpinner();
        }
    }

    updateTokenStatus(status, message) {
        const tokenStatus = document.getElementById('token-status');
        if (tokenStatus) {
            tokenStatus.className = `token-status ${status}`;
            tokenStatus.textContent = message;
        }
    }

    startTokenStatusCheck() {
        // Check token status every 30 seconds
        setInterval(() => {
            this.checkTokenStatus();
        }, 30000);

        // Initial check
        this.checkTokenStatus();
    }

    async checkTokenStatus() {
        const tokenStatus = utils.getTokenStatus();
        if (tokenStatus === 'expired') {
            this.updateTokenStatus('expired', 'Token expired - please test credentials');
        } else if (tokenStatus === 'valid') {
            this.updateTokenStatus('valid', 'Token is valid');
        }
    }

    async handleDefaultFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.currentFile = file;
            this.updateCurrentDefaultFile(file.name);
            this.updateDefaultFileDisplay();
            
            // Parse CSV to populate column mapping
            try {
                const text = await file.text();
                const headers = this.parseCSVHeaders(text);
                this.populateColumnMapping(headers);
            } catch (error) {
                utils.log(`Failed to parse CSV file: ${error.message}`, 'error');
            }
        }
    }

    parseCSVHeaders(csvText) {
        const lines = csvText.split('\n');
        if (lines.length > 0) {
            return lines[0].split(',').map(header => header.trim().replace(/"/g, ''));
        }
        return [];
    }

    updateCurrentDefaultFile(filename) {
        const currentFileInfo = document.getElementById('current-default-file');
        if (currentFileInfo) {
            currentFileInfo.textContent = filename;
        }
    }

    populateColumnMapping(headers) {
        const columnSelects = document.querySelectorAll('.column-select');
        columnSelects.forEach(select => {
            // Clear existing options except the first one
            while (select.children.length > 1) {
                select.removeChild(select.lastChild);
            }
            
            // Add new options
            headers.forEach(header => {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                select.appendChild(option);
            });
        });
    }

    saveColumnMapping() {
        try {
            const mapping = {
                usernameColumn: document.getElementById('username-column').value,
                emailColumn: document.getElementById('email-column').value,
                firstnameColumn: document.getElementById('firstname-column').value,
                lastnameColumn: document.getElementById('lastname-column').value,
                populationColumn: document.getElementById('population-column').value
            };

            const currentSettings = this.getCurrentSettings();
            const updatedSettings = { ...currentSettings, ...mapping };
            localStorage.setItem('pingone-settings', JSON.stringify(updatedSettings));
            
            utils.log('Column mapping saved', 'info');
        } catch (error) {
            utils.log(`Failed to save column mapping: ${error.message}`, 'error');
        }
    }

    saveAppSettings() {
        try {
            const formData = new FormData(document.getElementById('app-settings-form'));
            const appSettings = {
                language: formData.get('language'),
                recordsPerPage: formData.get('recordsPerPage'),
                defaultFile: this.currentFile ? this.currentFile.name : null
            };

            const currentSettings = this.getCurrentSettings();
            const updatedSettings = { ...currentSettings, ...appSettings };
            localStorage.setItem('pingone-settings', JSON.stringify(updatedSettings));
            
            utils.log('App settings saved', 'info');
        } catch (error) {
            utils.log(`Failed to save app settings: ${error.message}`, 'error');
        }
    }

    saveAllSettings() {
        try {
            // Consolidate all settings from different forms
            const credentialsData = new FormData(document.getElementById('credentials-form'));
            const appSettingsData = new FormData(document.getElementById('app-settings-form'));

            const settings = {
                // Credentials
                environmentId: credentialsData.get('environmentId'),
                clientId: credentialsData.get('clientId'),
                clientSecret: credentialsData.get('clientSecret'),
                baseUrl: credentialsData.get('baseUrl'),
                saveCredentials: credentialsData.get('saveCredentials') === 'on',
                useClientSecret: credentialsData.get('useClientSecret') === 'on',

                // App settings
                language: appSettingsData.get('language'),
                recordsPerPage: appSettingsData.get('recordsPerPage'),

                // Default file - handle separately
                defaultFile: this.currentFile ? this.currentFile.name : document.getElementById('current-default-file').textContent,

                // Column mapping
                usernameColumn: document.getElementById('username-column').value,
                emailColumn: document.getElementById('email-column').value,
                firstnameColumn: document.getElementById('firstname-column').value,
                lastnameColumn: document.getElementById('lastname-column').value,
                populationColumn: document.getElementById('population-column').value
            };

            const settingsToSave = { ...settings };

            // Save to localStorage
            if (settingsToSave.saveCredentials) {
                localStorage.setItem('pingone-settings', JSON.stringify(settingsToSave));
            } else {
                // Don't save credentials if not requested
                delete settingsToSave.environmentId;
                delete settingsToSave.clientId;
                delete settingsToSave.clientSecret;
                // Also remove the saveCredentials flag so it's not checked on next load
                delete settingsToSave.saveCredentials; 
                localStorage.setItem('pingone-settings', JSON.stringify(settingsToSave));
            }

            utils.log('All settings saved', 'info');
            utils.showModal(
                'Configuration Saved',
                'Your configuration has been successfully saved.',
                { confirmText: 'OK', showCancel: false }
            );

        } catch (error) {
            utils.handleError(error, 'saveAllSettings');
        }
    }

    deleteSettings() {
        utils.showModal(
            'Delete Configuration',
            'Are you sure you want to delete all saved configuration? This action cannot be undone.',
            {
                confirmText: 'Delete',
                cancelText: 'Cancel',
                onConfirm: () => {
                    localStorage.removeItem('pingone-settings');
                    this.resetFormFields();
                    utils.log('Settings deleted', 'info');
                    utils.showModal(
                        'Configuration Deleted',
                        'All configuration has been deleted.',
                        { confirmText: 'OK', showCancel: false }
                    );
                }
            }
        );
    }

    resetSettings() {
        utils.showModal(
            'Reset Configuration',
            'Are you sure you want to reset all settings to their default values?',
            {
                confirmText: 'Reset',
                cancelText: 'Cancel',
                onConfirm: () => {
                    this.resetFormFields();
                    utils.log('Settings reset to defaults', 'info');
                    utils.showModal(
                        'Configuration Reset',
                        'All settings have been reset to their default values.',
                        { confirmText: 'OK', showCancel: false }
                    );
                }
            }
        );
    }

    resetFormFields() {
        // Reset all form fields to default values
        document.getElementById('environment-id').value = '';
        document.getElementById('client-id').value = '';
        document.getElementById('client-secret').value = '';
        document.getElementById('base-url').value = 'https://api.pingone.com';
        document.getElementById('save-credentials').checked = false;
        document.getElementById('use-client-secret').checked = true;
        document.getElementById('language').value = 'en';
        document.getElementById('records-per-page').value = '25';
        document.getElementById('default-file').value = '';
        document.getElementById('current-default-file').textContent = '';
        
        // Reset column mapping
        const columnSelects = document.querySelectorAll('.column-select');
        columnSelects.forEach(select => {
            select.value = '';
        });

        // Clear current file
        this.currentFile = null;
        this.updateDefaultFileDisplay();
        
        // Clear token status
        this.updateTokenStatus('', '');
    }

    getCurrentSettings() {
        try {
            const settings = localStorage.getItem('pingone-settings');
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            utils.log(`Failed to get current settings: ${error.message}`, 'error');
            return {};
        }
    }

    updatePageLanguage() {
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            const savedLanguage = this.getCurrentSettings().language || 'en';
            languageSelect.value = savedLanguage;
            
            languageSelect.addEventListener('change', (e) => {
                const newLanguage = e.target.value;
                const currentSettings = this.getCurrentSettings();
                currentSettings.language = newLanguage;
                localStorage.setItem('pingone-settings', JSON.stringify(currentSettings));
                utils.log('Language changed', 'info');
            });
        }
    }
}

// Initialize the settings page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SettingsPage();
}); 
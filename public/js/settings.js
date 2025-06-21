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
        
        const settings = this.getCurrentSettings();
        const fileName = this.currentFile ? this.currentFile.name : settings.defaultFile;

        if (fileName) {
            defaultFileName.textContent = fileName;
            defaultFileDisplay.classList.remove('hidden');
        } else {
            defaultFileDisplay.classList.add('hidden');
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
                clientSecret: formData.get('clientSecret')
            };

            if (!credentials.environmentId || !credentials.clientId || !credentials.clientSecret) {
                throw new Error('Environment ID, Client ID, and Client Secret are required');
            }

            utils.showSpinner('Testing credentials...');
            this.updateTokenStatus('loading', 'Testing credentials...');

            await utils.getWorkerToken(credentials.environmentId, credentials.clientId, credentials.clientSecret);
            this.updateTokenStatus('valid', 'Credentials are valid');
        } catch (error) {
            this.updateTokenStatus('expired', `Failed to get token: ${error.message}`);
            utils.handleError(error, 'testCredentials');
        } finally {
            utils.hideSpinner();
        }
    }

    updateTokenStatus(status, message) {
        const tokenStatus = document.getElementById('token-status');
        if (!tokenStatus) return;

        tokenStatus.className = `token-status ${status}`;
        tokenStatus.textContent = message;
    }

    startTokenStatusCheck() {
        this.checkTokenStatus();
        setInterval(() => this.checkTokenStatus(), 60000); // Check every minute
    }

    async checkTokenStatus() {
        const tokenStatus = utils.getTokenStatus();
        if (tokenStatus.valid) {
            const minutes = Math.round(tokenStatus.timeRemaining / 60000);
            this.updateTokenStatus('valid', `Token valid (${minutes} minutes remaining)`);
        } else {
            this.updateTokenStatus('expired', 'Token expired or not set');
        }
    }

    async handleDefaultFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            utils.showModal('Invalid File', 'Please select a valid CSV file.', { confirmText: 'OK', showCancel: false });
            return;
        }
        
        this.currentFile = file;
        this.updateCurrentDefaultFile(file.name);
        
        const csvText = await file.text();
        const headers = this.parseCSVHeaders(csvText);
        this.populateColumnMapping(headers);
    }

    parseCSVHeaders(csvText) {
        const firstLine = csvText.split('\n')[0];
        return firstLine.split(',').map(h => h.trim());
    }

    updateCurrentDefaultFile(filename) {
        const display = document.getElementById('current-default-file');
        if (display) {
            display.textContent = `Current: ${filename}`;
        }
    }

    populateColumnMapping(headers) {
        const selects = document.querySelectorAll('.column-select');
        selects.forEach(select => {
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
        const settings = this.getCurrentSettings();
        settings.usernameColumn = document.getElementById('username-column').value;
        settings.emailColumn = document.getElementById('email-column').value;
        settings.firstnameColumn = document.getElementById('firstname-column').value;
        settings.lastnameColumn = document.getElementById('lastname-column').value;
        settings.populationColumn = document.getElementById('population-column').value;
        localStorage.setItem('pingone-settings', JSON.stringify(settings));
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

    async saveAllSettings() {
        try {
            utils.showSpinner('Saving settings...');

            const credentialsFormData = new FormData(document.getElementById('credentials-form'));
            const appSettingsFormData = new FormData(document.getElementById('app-settings-form'));

            const settings = this.getCurrentSettings();

            // Handle credential persistence
            const saveCredentials = document.getElementById('save-credentials').checked;
            settings.saveCredentials = saveCredentials;

            if (saveCredentials) {
                settings.environmentId = credentialsFormData.get('environmentId');
                settings.clientId = credentialsFormData.get('clientId');
                settings.clientSecret = credentialsFormData.get('clientSecret');
                settings.baseUrl = credentialsFormData.get('baseUrl');
            } else {
                delete settings.environmentId;
                delete settings.clientId;
                delete settings.clientSecret;
            }

            // Other settings
            settings.useClientSecret = document.getElementById('use-client-secret').checked;
            settings.recordsPerPage = appSettingsFormData.get('recordsPerPage');
            if (this.currentFile) {
                settings.defaultFile = this.currentFile.name;
            }

            this.saveColumnMapping();
            const mappingSettings = this.getCurrentSettings();
            const finalSettings = { ...settings, ...mappingSettings };
            
            localStorage.setItem('pingone-settings', JSON.stringify(finalSettings));
            
            utils.log('All settings saved', 'info');
            utils.hideSpinner();

            utils.showModal(
                'Settings Saved',
                'All your settings have been successfully saved.',
                { confirmText: 'OK', showCancel: false }
            );

        } catch (error) {
            utils.handleError(error, 'saveAllSettings');
        }
    }

    async deleteSettings() {
        utils.showModal('Delete Settings', 'Are you sure you want to delete all settings? This action cannot be undone.', {
            confirmText: 'Delete',
            onConfirm: () => {
                localStorage.removeItem('pingone-settings');
                this.resetFormFields();
                utils.log('All settings deleted', 'info');
                utils.showModal('Settings Deleted', 'All settings have been deleted.', { confirmText: 'OK', showCancel: false });
            },
            showCancel: true
        });
    }

    async resetSettings() {
        utils.showModal('Reset Settings', 'Are you sure you want to reset all settings to their default values?', {
            confirmText: 'Reset',
            onConfirm: () => {
                localStorage.removeItem('pingone-settings');
                this.resetFormFields();
                utils.log('All settings reset', 'info');
                utils.showModal('Settings Reset', 'All settings have been reset to their default values.', { confirmText: 'OK', showCancel: false });
            },
            showCancel: true
        });
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
}

// Initialize the settings page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SettingsPage();
}); 
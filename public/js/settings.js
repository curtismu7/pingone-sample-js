// Settings page functionality for Ping Identity User Management

class SettingsPage {
    constructor() {
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

    setupEventListeners() {
        document.getElementById('save-all-settings')?.addEventListener('click', () => this.saveAllSettings());
        document.getElementById('test-credentials')?.addEventListener('click', () => this.testCredentials());
        document.getElementById('default-file')?.addEventListener('change', (e) => this.handleDefaultFileSelect(e));
        document.getElementById('toggle-secret')?.addEventListener('click', () => this.toggleSecretVisibility());
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
            }
        } catch (error) {
            utils.handleError(error, 'loadSettings');
        }
    }

    populateFormFields(settings) {
        // Credentials
        document.getElementById('environment-id').value = settings.environmentId || '';
        document.getElementById('client-id').value = settings.clientId || '';
        document.getElementById('client-secret').value = settings.clientSecret || '';
        document.getElementById('base-url').value = settings.baseUrl || 'https://api.pingone.com';
        document.getElementById('save-credentials').checked = settings.saveCredentials === true;
        document.getElementById('use-client-secret').checked = settings.useClientSecret !== false; // Default to true

        // App settings
        if (settings.recordsPerPage) {
            document.getElementById('records-per-page').value = settings.recordsPerPage;
        }
        if (settings.defaultFileName) {
            this.updateDefaultFileDisplay(settings.defaultFileName);
        }
    }

    async saveAllSettings() {
        const saveBtn = document.getElementById('save-all-settings');
        try {
            const settings = {
                environmentId: document.getElementById('environment-id').value,
                clientId: document.getElementById('client-id').value,
                baseUrl: document.getElementById('base-url').value,
                saveCredentials: document.getElementById('save-credentials').checked,
                useClientSecret: document.getElementById('use-client-secret').checked,
                recordsPerPage: document.getElementById('records-per-page').value,
                defaultFileName: document.getElementById('current-default-file')?.textContent || null
            };

            if (settings.saveCredentials) {
                settings.clientSecret = document.getElementById('client-secret').value;
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
            setTimeout(() => {
                saveBtn.textContent = 'Save Configuration';
            }, 2000);
        }
    }

    async testCredentials() {
        try {
            utils.showSpinner('Testing credentials...');
            this.updateTokenStatus('loading', 'Testing...');

            const credentials = {
                environmentId: document.getElementById('environment-id').value,
                clientId: document.getElementById('client-id').value,
                clientSecret: document.getElementById('client-secret').value
            };

            if (!credentials.environmentId || !credentials.clientId) {
                throw new Error('Environment ID and Client ID are required to test credentials.');
            }

            await utils.getWorkerToken(credentials.environmentId, credentials.clientId, credentials.clientSecret, true); // Force refetch
            
            this.updateTokenStatus('valid', '✓ Credentials are valid');
        } catch (error) {
            const errorMessage = error.message || 'An unknown error occurred';
            this.updateTokenStatus('expired', `✗ ${errorMessage}`);
            utils.handleError(error, 'testCredentials');
        } finally {
            utils.hideSpinner();
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
                this.updateTokenStatus('unknown', 'Enter credentials to test.');
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
        if(display) {
            display.textContent = fileName ? `Current: ${fileName}` : '';
        }
    }
}

// Initialize the settings page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settingsPage = new SettingsPage();
}); 
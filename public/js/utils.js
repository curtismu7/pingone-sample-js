// Utility functions for the Ping Identity User Management application

class Utils {
    constructor() {
        this.tokenCache = {
            token: null,
            expiresAt: null
        };
        this.settings = {};
        this.init();
    }

    async init() {
        this.setupSidebar();
        this.setupModals();
        this.setupSpinner();
        this.loadSettings();
    }

    // Token Management
    async getWorkerToken(environmentId, clientId, clientSecret, force = false) {
        const now = Date.now();
        
        // Check cache unless forced
        if (!force && this.isTokenValid()) {
            this.log('Token cache hit', 'info');
            return this.tokenCache.token;
        }

        this.log('Getting new worker token', 'info', { force });
        
        try {
            const response = await fetch('/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ environmentId, clientId, clientSecret })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.error) { throw new Error(data.error); }

            // Cache token for 55 minutes
            this.tokenCache.token = data.access_token;
            this.tokenCache.expiresAt = now + (55 * 60 * 1000);
            
            this.log('Worker token obtained and cached', 'info');
            return data.access_token;
            
        } catch (error) {
            this.log(`Failed to get worker token: ${error.message}`, 'error');
            throw error;
        }
    }

    isTokenValid() {
        return this.tokenCache.token && this.tokenCache.expiresAt && Date.now() < this.tokenCache.expiresAt;
    }

    clearTokenCache() {
        this.tokenCache = { token: null, expiresAt: null };
        this.log('Token cache cleared', 'info');
    }

    // Settings Management
    getStoredCredentials() {
        const creds = {
            environmentId: this.settings.environmentId,
            clientId: this.settings.clientId,
            clientSecret: this.settings.clientSecret,
            baseUrl: this.settings.baseUrl
        };
        
        if (creds.environmentId && creds.clientId) {
            return creds;
        }
        return null;
    }

    saveSettings() {
        const settings = {
            // Add other settings as needed
        };
        
        try {
            localStorage.setItem('pingone-settings', JSON.stringify(settings));
            this.log('Settings saved', 'info');
        } catch (error) {
            this.log(`Failed to save settings: ${error.message}`, 'error');
        }
    }

    loadSettings() {
        try {
            const settingsString = localStorage.getItem('pingone-settings');
            if (settingsString) {
                this.settings = JSON.parse(settingsString);
                this.log('Settings loaded', 'info');
                return this.settings;
            }
        } catch (error) {
            this.log(`Failed to load settings: ${error.message}`, 'error');
            this.settings = {};
        }
        return null;
    }

    // Logging
    log(message, level = 'info', data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, data, source: 'client' };

        // Console logging
        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');

        // Send to server for file logging
        this.sendLogToServer(logEntry);
    }

    async sendLogToServer(logEntry) {
        try {
            await fetch('/api/log', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logEntry)
            });
        } catch (error) {
            // Silently fail for logging errors
            console.warn('Failed to send log to server:', error);
        }
    }

    // Modal Management
    setupModals() {
        const modal = document.getElementById('modal');
        const modalClose = document.getElementById('modal-close');
        const modalCancel = document.getElementById('modal-cancel');

        const closeModal = () => this.hideModal();

        modalClose?.addEventListener('click', closeModal);
        modalCancel?.addEventListener('click', closeModal);

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal?.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    showModal(title, content, options = {}) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        let modalConfirm = document.getElementById('modal-confirm');
        const modalCancel = document.getElementById('modal-cancel');

        if (!modal || !modalTitle || !modalBody || !modalConfirm || !modalCancel) {
            return;
        }

        modalTitle.textContent = title;
        modalBody.innerHTML = content;

        modalConfirm.textContent = options.confirmText || 'OK';
        modalCancel.textContent = options.cancelText || 'Cancel';

        modalCancel.classList.toggle('hidden', !options.showCancel);

        const newConfirm = modalConfirm.cloneNode(true);
        modalConfirm.parentNode.replaceChild(newConfirm, modalConfirm);
        
        const confirmHandler = () => {
            if (options.onConfirm) {
                options.onConfirm();
            }
            this.hideModal();
        };

        newConfirm.addEventListener('click', confirmHandler, { once: true });

        modal.classList.remove('hidden');
    }

    hideModal() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    // Spinner Management
    setupSpinner() {
        // Spinner is already in HTML, just need to control visibility
    }

    showSpinner(text = 'Loading...') {
        const spinner = document.getElementById('spinner');
        const spinnerText = document.getElementById('spinner-text');
        
        if (spinnerText) {
            spinnerText.textContent = text;
        }
        
        if (spinner) {
            spinner.classList.remove('hidden');
        }
    }

    hideSpinner() {
        const spinner = document.getElementById('spinner');
        if (spinner) {
            spinner.classList.add('hidden');
        }
    }

    // Tooltip Setup
    setupTooltips() {
        // Initialize Tippy.js for elements with data-tippy attribute
        tippy('[data-tippy]', {
            content: (reference) => {
                const key = reference.getAttribute('data-tippy');
                return key;
            },
            placement: 'top',
            arrow: true,
            theme: 'pingone',
            duration: [200, 150]
        });
    }

    // CSV Processing
    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                return reject(new Error("No file provided for parsing."));
            }
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const csvData = e.target.result;
                    const result = this.parseCSVData(csvData);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read CSV file.'));
            reader.readAsText(file);
        });
    }

    parseCSVData(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        const errors = [];
        const data = [];
        
        if (lines.length === 0) {
            throw new Error('Empty CSV file');
        }
        
        // Parse header
        const header = this.parseCSVLine(lines[0]);
        
        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            try {
                const values = this.parseCSVLine(lines[i]);
                const row = {};
                
                // Map values to header
                header.forEach((col, index) => {
                    row[col] = values[index] || '';
                });
                
                data.push(row);
            } catch (error) {
                errors.push({
                    row: i + 1,
                    error: error.message
                });
            }
        }
        
        return { data, errors };
    }
    
    // Parse a single CSV line
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last field
        result.push(current.trim());
        
        return result;
    }

    // File Management
    getFileInfo(file) {
        return {
            name: file.name,
            size: this.formatFileSize(file.size),
            type: file.type,
            lastModified: new Date(file.lastModified).toLocaleString()
        };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Pagination Helper
    paginateData(data, page, perPage) {
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        
        return {
            data: data.slice(startIndex, endIndex),
            total: data.length,
            page,
            perPage,
            totalPages: Math.ceil(data.length / perPage),
            hasNext: page < Math.ceil(data.length / perPage),
            hasPrev: page > 1
        };
    }

    // Error Handling
    handleError(error, context = '') {
        const errorMessage = error.message || 'An unknown error occurred.';
        this.log(`Error in ${context}: ${errorMessage}`, 'error', { error: error.toString(), stack: error.stack });

        this.hideSpinner();
        
        if (window.mainPage && typeof window.mainPage.hideImportProgress === 'function') {
            window.mainPage.hideImportProgress();
        }

        if (errorMessage.includes('configure your PingOne credentials')) {
            this.showModal(
                'Credentials Required',
                'You need to configure your PingOne credentials before performing this action.',
                {
                    confirmText: 'Go to Configuration',
                    onConfirm: () => {
                        window.location.href = 'settings.html';
                    },
                    showCancel: true,
                    cancelText: 'Cancel'
                }
            );
        } else {
            this.showModal(
                `Error in ${context}`,
                errorMessage,
                { confirmText: 'OK', showCancel: false }
            );
        }
    }

    // Validation
    validateEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    validateRequired(value, fieldName) {
        if (!value || value.trim() === '') {
            throw new Error(`${fieldName} is required`);
        }
        return true;
    }

    // Date/Time Utilities
    formatDate(date) {
        return new Date(date).toLocaleDateString();
    }

    formatDateTime(date) {
        return new Date(date).toLocaleString();
    }

    // Network Utilities
    async makeRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, finalOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return await response.text();
        } catch (error) {
            this.log(`Request failed: ${error.message}`, 'error');
            throw error;
        }
    }

    setupSidebar() {
        const userActionsToggle = document.getElementById('user-actions-toggle');
        if (userActionsToggle) {
            userActionsToggle.addEventListener('click', (e) => {
                e.preventDefault();
                const dropdown = userActionsToggle.closest('.nav-dropdown');
                const submenu = dropdown.querySelector('.nav-submenu');
                dropdown.classList.toggle('open');
                submenu.classList.toggle('show');
            });
        }
    }
}

// Initialize utilities globally
document.addEventListener('DOMContentLoaded', () => {
    window.utils = new Utils();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
} 
// Simplified utils.js with essential functionality for PingOne Integration

// Create a global utils object if it doesn't exist
if (!window.utils) {
    // Token cache for authentication
    let tokenCache = {
        token: null,
        expiresAt: null
    };

    // Define all utility functions and assign to window immediately
    const utils = window.utils = {
        // Check if token is valid
        isTokenValid: function() {
            if (!tokenCache.token || !tokenCache.expiresAt) return false;
            return Date.now() < tokenCache.expiresAt - 60000; // 1 minute buffer
        },

        // Get worker token with automatic caching
        getWorkerToken: async function() {
            const settings = this.getSettings();
            if (!settings || !settings.environmentId || !settings.clientId) {
                throw new Error('Missing PingOne credentials. Please configure in Settings.');
            }

            if (this.isTokenValid()) {
                const timeRemaining = Math.floor((tokenCache.expiresAt - Date.now()) / 60000);
                this.log('Using cached worker token', 'info', { timeRemaining });
                return {
                    success: true,
                    data: {
                        access_token: tokenCache.token,
                        expires_in: Math.floor((tokenCache.expiresAt - Date.now()) / 1000)
                    },
                    cached: true
                };
            }

            try {
                const response = await fetch('/api/token/worker', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        environmentId: settings.environmentId,
                        clientId: settings.clientId,
                        clientSecret: settings.clientSecret || ''
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to get worker token');
                }

                const data = await response.json();
                
                // Cache the token
                tokenCache = {
                    token: data.access_token,
                    expiresAt: Date.now() + (data.expires_in * 1000)
                };

                return {
                    success: true,
                    data: data
                };
            } catch (error) {
                this.log('Failed to get worker token: ' + error.message, 'error');
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        // Save credentials to localStorage
        saveCredentials: function(credentials) {
            try {
                if (!credentials || !credentials.environmentId || !credentials.clientId) {
                    throw new Error('Missing required credential fields');
                }

                const credsToSave = {
                    environmentId: credentials.environmentId,
                    clientId: credentials.clientId,
                    clientSecret: credentials.clientSecret || '',
                    useClientSecret: credentials.useClientSecret !== false,
                    baseUrl: credentials.baseUrl || 'https://api.pingone.com'
                };

                localStorage.setItem('pingone-settings', JSON.stringify(credsToSave));
                return true;
            } catch (error) {
                this.log('Error saving credentials: ' + error.message, 'error');
                return false;
            }
        },

        // Get stored credentials
        getStoredCredentials: function() {
            return this.getSettings();
        },

        // Show confirmation dialog
        confirm: function(title, message) {
            return new Promise((resolve) => {
                const confirmed = window.confirm(`${title}\n\n${message}`);
                resolve(confirmed);
            });
        },

        // Validate email address
        validateEmail: function(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(String(email).toLowerCase());
        },

        // Format date
        formatDate: function(date) {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleString();
        },

        // Debounce function
        debounce: function(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },
        // Basic logging function
        log: function(message, level = 'info') {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
            
            switch(level.toLowerCase()) {
                case 'error':
                    console.error(logMessage);
                    break;
                case 'warn':
                    console.warn(logMessage);
                    break;
                case 'debug':
                    console.debug(logMessage);
                    break;
                default:
                    console.log(logMessage);
            }
            
            return logMessage;
        },
        
        // Show alert message
        alert: function(message, type = 'info') {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type}`;
            alertDiv.textContent = message;
            
            document.body.prepend(alertDiv);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (document.body.contains(alertDiv)) {
                    alertDiv.remove();
                }
            }, 5000);
        },

        // Show success message
        showSuccessMessage: function(message) {
            this.alert(message, 'success');
        },

        // Show error message
        showErrorMessage: function(message) {
            this.alert(message, 'error');
        },

        // Show spinner
        showSpinner: function(message = 'Loading...', options = {}) {
            const spinner = document.getElementById('spinner');
            const spinnerText = document.getElementById('spinner-text');
            if (spinner && spinnerText) {
                // Update main message
                spinnerText.textContent = message;
                
                // Update title if provided
                if (options.title) {
                    this.updateSpinnerTitle(options.title);
                }
                
                // Initialize counters
                this.updateSpinnerCounters({
                    total: options.total || 0,
                    success: 0,
                    skipped: 0,
                    failed: 0
                });
                
                // Clear previous details
                this.clearSpinnerDetails();
                
                // Reset progress
                this.updateSpinnerProgress(0);
                
                // Show the spinner
                spinner.classList.remove('hidden');
            }
        },

        // Hide spinner
        hideSpinner: function() {
            const spinner = document.getElementById('spinner');
            if (spinner) {
                spinner.classList.add('hidden');
            }
        },

        // Initialize function
        init: function() {
            this.setupSpinner();
            this.setupModals();
            this.log('Utils initialized');
            
            // Set up spinner cancel button if it exists
            const cancelBtn = document.getElementById('spinner-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    this.hideSpinner();
                    // You can add additional cleanup here if needed
                });
            }
        },

        // Get settings from localStorage
        getSettings: function() {
            try {
                return JSON.parse(localStorage.getItem('pingone-settings')) || {};
            } catch (e) {
                console.error('Error getting settings:', e);
                return {};
            }
        },

        // Save settings to localStorage
        saveSettings: function(settings) {
            try {
                localStorage.setItem('pingone-settings', JSON.stringify(settings));
                return true;
            } catch (e) {
                console.error('Error saving settings:', e);
                return false;
            }
        },

        // Clear token cache
        clearTokenCache: function() {
            localStorage.removeItem('pingone-token');
            localStorage.removeItem('pingone-token-expiry');
        },
        
        // Setup spinner element
        setupSpinner: function() {
            // Create spinner if it doesn't exist
            if (!document.getElementById('spinner')) {
                const spinner = document.createElement('div');
                spinner.id = 'spinner';
                spinner.className = 'spinner hidden';
                spinner.innerHTML = `
                    <div class="spinner-content">
                        <div class="spinner-icon"></div>
                        <div class="spinner-header">
                            <h3 id="spinner-title">Processing</h3>
                            <div id="spinner-close" class="spinner-close">&times;</div>
                        </div>
                        <p id="spinner-text">Loading...</p>
                        <div class="progress-container">
                            <div id="spinner-progress" class="progress-bar"></div>
                        </div>
                        <div class="progress-stats">
                            <div class="stat-item">
                                <span class="stat-label">Total:</span>
                                <span id="spinner-total" class="stat-value">0</span>
                            </div>
                            <div class="stat-item success">
                                <span class="stat-label">Success:</span>
                                <span id="spinner-success" class="stat-value">0</span>
                            </div>
                            <div class="stat-item warning">
                                <span class="stat-label">Skipped:</span>
                                <span id="spinner-skipped" class="stat-value">0</span>
                            </div>
                            <div class="stat-item error">
                                <span class="stat-label">Failed:</span>
                                <span id="spinner-failed" class="stat-value">0</span>
                            </div>
                        </div>
                        <div class="spinner-actions">
                            <button id="spinner-cancel" class="btn-pill spinner-cancel-btn">Cancel</button>
                            <div id="spinner-details" class="spinner-details"></div>
                        </div>
                    </div>
                `;
                document.body.appendChild(spinner);

                // Add close button handler
                const closeBtn = document.getElementById('spinner-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => this.hideSpinner());
                }
            }
        },

        // Update spinner progress
        updateSpinnerProgress: function(progress) {
            const progressBar = document.getElementById('spinner-progress');
            if (progressBar) {
                progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            }
        },

        // Update spinner counters
        updateSpinnerCounters: function(counters) {
            // Handle case where counters is undefined or null
            if (!counters) return;
            
            // Helper function to safely set text content
            var setTextContent = function(id, value) {
                if (value === null || value === undefined) return;
                var el = document.getElementById(id);
                if (el) el.textContent = value;
            };
            
            // Update each counter if provided
            setTextContent('spinner-total', counters.total);
            setTextContent('spinner-success', counters.success);
            setTextContent('spinner-skipped', counters.skipped);
            setTextContent('spinner-failed', counters.failed);
        },

        // Add details to spinner
        addSpinnerDetails: function(details) {
            const detailsEl = document.getElementById('spinner-details');
            if (detailsEl) {
                const detailEl = document.createElement('div');
                detailEl.className = 'spinner-detail';
                detailEl.textContent = details;
                detailsEl.appendChild(detailEl);
                detailsEl.scrollTop = detailsEl.scrollHeight;
            }
        },

        // Clear spinner details
        clearSpinnerDetails: function() {
            const detailsEl = document.getElementById('spinner-details');
            if (detailsEl) detailsEl.innerHTML = '';
        },

        // Update spinner title
        updateSpinnerTitle: function(title) {
            const titleEl = document.getElementById('spinner-title');
            if (titleEl) titleEl.textContent = title;
        },

        // Handle errors consistently
        handleError: function(error, context = '') {
            const message = context ? `${context}: ${error.message || error}` : error.message || error;
            this.log(message, 'error');
            this.alert(message, 'error');
            return {
                success: false,
                error: message
            };
        },
    
        // Test credentials
        testCredentials: async function(environmentId, clientId, clientSecret) {
            try {
                const response = await fetch('/api/token/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ environmentId, clientId, clientSecret })
                });
                return await response.json();
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        // Get environment information
        getEnvironmentInfo: async function() {
            try {
                const settings = this.getSettings();
                if (!settings.environmentId || !settings.clientId) {
                    return { 
                        success: false, 
                        message: 'Environment ID and Client ID are required' 
                    };
                }
                
                // Return mock environment info for the simple version
                return {
                    success: true,
                    data: {
                        name: 'PingOne Environment',
                        id: settings.environmentId,
                        clientId: settings.clientId
                    }
                };
            } catch (error) {
                this.log('Failed to get environment info: ' + error.message, 'error');
                return {
                    success: false,
                    message: error.message
                };
            }
        },
        
        // Show a modal dialog
        showModal: function(title, content, options = {}) {
            // Simple modal implementation
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <span class="close">&times;</span>
                    </div>
                    <div class="modal-body">
                        ${typeof content === 'string' ? content : content.outerHTML}
                    </div>
                    <div class="modal-footer">
                        ${options.showCancel !== false ? '<button class="btn btn-secondary" id="modal-cancel">Cancel</button>' : ''}
                        <button class="btn btn-primary" id="modal-confirm">${options.confirmText || 'OK'}</button>
                    </div>
                </div>
            `;
            
            // Add to document
            document.body.appendChild(modal);
            
            // Get reference to utils for use in callbacks
            const self = this;
            
            // Setup close button
            const closeBtn = modal.querySelector('.close');
            closeBtn.onclick = () => self.hideModal(modal);
            
            // Setup confirm button
            const confirmBtn = modal.querySelector('#modal-confirm');
            confirmBtn.onclick = () => {
                if (options.onConfirm) options.onConfirm();
                self.hideModal(modal);
            };
            
            // Setup cancel button if exists
            const cancelBtn = modal.querySelector('#modal-cancel');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    if (options.onCancel) options.onCancel();
                    self.hideModal(modal);
                };
            }
            
            // Show modal
            modal.style.display = 'block';
            
            // Return the modal element in case it needs to be referenced
            return modal;
        },
        
        // Hide a modal dialog
        hideModal: function(modal) {
            if (modal) {
                modal.remove();
            } else {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(m => m.remove());
            }
        }
    };
    
    // Initialize modals
    window.utils = utils;

    // Initialize when DOM is loaded
    function initUtils() {
        try {
            // Setup any DOM-dependent functionality here
            if (typeof utils.setupSpinner === 'function') utils.setupSpinner();
            if (typeof utils.setupModals === 'function') utils.setupModals();
            
            // Log that utils are ready
            console.log('Utils initialized');
            
            // Dispatch custom event when utils are ready
            if (typeof document.dispatchEvent === 'function') {
                var event = document.createEvent('CustomEvent');
                event.initCustomEvent('utils:ready', true, true, {});
                document.dispatchEvent(event);
            }
        } catch (error) {
            console.error('Error initializing utils:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUtils);
    } else {
        // DOMContentLoaded has already fired
        initUtils();
    }
}

// Utility functions for the Ping Identity User Management application
// This file provides core functionality: authentication, UI management, logging, and API helpers
// Debugging: Check browser console for detailed operation logs and error messages

class Utils {
    constructor() {
        // Token cache to avoid repeated authentication requests
        // DEBUG: Check this.tokenCache object for current authentication state
        this.tokenCache = {
            token: null,
            expiresAt: null
        };
        
        // Application settings storage
        // DEBUG: Check this.settings object for current configuration
        this.settings = {};
        
        // Progress simulation state
        // DEBUG: Check these properties if progress updates aren't working
        this.progressInterval = null;
        this.progressSimulationActive = false;
        
        this.init();
    }

    async init() {
        // Initialize utility components
        // DEBUG: If utils don't work properly, check this initialization sequence
        try {
            this.setupSidebar();
            this.setupModals();
            this.setupSpinner();
            this.loadSettings();
            this.log('Utils initialized successfully', 'info');
        } catch (error) {
            console.error('Failed to initialize utils:', error);
            this.log('Utils initialization failed', 'error', { error: error.message });
        }
    }

    // ============================================================================
    // TOKEN MANAGEMENT
    // These functions handle PingOne API authentication and token caching
    // DEBUG: If authentication fails, check these functions first
    // ============================================================================

    async getWorkerToken() {
        // Get worker token with automatic caching and refresh
        // DEBUG: If token requests fail, check credentials and PingOne connectivity
        const settings = this.getSettings();
        if (!settings || !settings.environmentId || !settings.clientId || !settings.clientSecret) {
            throw new Error('Missing PingOne credentials. Please configure in Settings.');
        }

        const now = Date.now();
        
        // Check cache first to avoid unnecessary API calls
        // DEBUG: If tokens expire unexpectedly, check cache validation logic
        if (this.isTokenValid()) {
            const timeRemaining = Math.floor((this.tokenCache.expiresAt - now) / (60 * 1000));
            this.log('Using cached worker token', 'info', { timeRemaining });
            return {
                success: true,
                data: {
                    access_token: this.tokenCache.token,
                    expires_in: Math.floor((this.tokenCache.expiresAt - now) / 1000)
                },
                cached: true
            };
        }

        this.log('Requesting new worker token from PingOne', 'info', { 
            environmentId: settings.environmentId.substring(0, 8) + '...'
        });
        
        try {
            const response = await fetch('/api/token/worker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    environmentId: settings.environmentId,
                    clientId: settings.clientId,
                    clientSecret: settings.clientSecret
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                this.log(`Worker token request failed: ${response.status}`, 'error', errorData);
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.success) { 
                const errorMsg = data.error || 'Unknown token error';
                this.log(`Worker token error: ${errorMsg}`, 'error');
                throw new Error(errorMsg); 
            }

            // Cache token for reuse
            // DEBUG: Check cache expiration calculation if tokens expire early
            this.tokenCache.token = data.data.access_token;
            this.tokenCache.expiresAt = now + (data.data.expires_in * 1000);
            
            this.log('Worker token obtained and cached successfully', 'info', {
                expiresIn: data.data.expires_in + ' seconds',
                cached: data.cached || false
            });
            
            return data;
            
        } catch (error) {
            const errorMsg = error.message || error.toString() || 'Unknown error occurred';
            this.log(`Failed to get worker token: ${errorMsg}`, 'error');
            throw new Error(errorMsg);
        }
    }

    async testCredentials(environmentId, clientId, clientSecret) {
        // Test PingOne credentials without caching the token
        // DEBUG: Use this function to validate credentials before operations
        this.log('Testing PingOne credentials', 'info', { 
            environmentId: environmentId.substring(0, 8) + '...' 
        });
        
        try {
            const response = await fetch('/api/token/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ environmentId, clientId, clientSecret })
            });

            const data = await response.json();

            if (!response.ok) {
                this.log(`Credentials test failed: ${response.status}`, 'error', data);
                throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            if (data.success) {
                this.log('Credentials test successful', 'info', data.data);
                return data;
            } else {
                this.log('Credentials test failed', 'error', data);
                throw new Error(data.error || 'Unknown error during credentials test');
            }
            
        } catch (error) {
            this.log(`Credentials test error: ${error.message}`, 'error');
            throw error;
        }
    }

    isTokenValid() {
        // Check if cached token is still valid (with 5-minute buffer)
        // DEBUG: If tokens are considered invalid unexpectedly, check this logic
        if (!this.tokenCache.token || !this.tokenCache.expiresAt) {
            return false;
        }
        
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
        const now = Date.now();
        const isValid = now < (this.tokenCache.expiresAt - bufferTime);
        
        // DEBUG: Log token validation details
        if (!isValid) {
            this.log('Token validation failed', 'debug', {
                now: new Date(now).toISOString(),
                expiresAt: new Date(this.tokenCache.expiresAt).toISOString(),
                bufferTime: bufferTime / 1000 + ' seconds'
            });
        }
        
        return isValid;
    }

    async getEnvironmentInfo() {
        // Get PingOne environment information
        // DEBUG: If environment info fails to load, check API permissions
        try {
            const tokenResponse = await this.getWorkerToken();
            if (!tokenResponse.success) {
                throw new Error('Failed to get authentication token');
            }

            const settings = this.getSettings();
            const response = await fetch(`https://api.pingone.com/v1/environments/${settings.environmentId}`, {
                headers: {
                    'Authorization': `Bearer ${tokenResponse.data.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get environment info: ${response.status}`);
            }

            const data = await response.json();
            return {
                success: true,
                data: {
                    name: data.name || 'Unknown Environment',
                    id: settings.environmentId,
                    clientId: settings.clientId
                }
            };
        } catch (error) {
            this.log('Failed to get environment info', 'error', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    clearTokenCache() {
        // Clear cached authentication token
        // DEBUG: Call this function to force token refresh
        this.tokenCache = { token: null, expiresAt: null };
        this.log('Token cache cleared', 'info');
    }

    // ============================================================================
    // SETTINGS MANAGEMENT
    // These functions handle application configuration and credentials storage
    // DEBUG: If settings don't persist, check localStorage functionality
    // ============================================================================

    getSettings() {
        // Get current application settings
        // DEBUG: Check localStorage for 'pingone-settings' key
        try {
            const settingsString = localStorage.getItem('pingone-settings');
            if (settingsString) {
                const settings = JSON.parse(settingsString);
                this.settings = settings;
                return settings;
            }
            return null;
        } catch (error) {
            this.log('Failed to get settings', 'error', { error: error.message });
            return null;
        }
    }

    saveSettings(settings) {
        // Save application settings to localStorage
        // DEBUG: If settings don't save, check localStorage quota and permissions
        try {
            localStorage.setItem('pingone-settings', JSON.stringify(settings));
            this.settings = settings;
            this.log('Settings saved successfully', 'info');
            return true;
        } catch (error) {
            this.log(`Failed to save settings: ${error.message}`, 'error');
            return false;
        }
    }

    loadSettings() {
        // Load settings from localStorage on initialization
        // DEBUG: Check browser's localStorage for stored settings
        try {
            const settings = this.getSettings();
            if (settings) {
                this.log('Settings loaded from localStorage', 'info');
                return settings;
            } else {
                this.log('No saved settings found', 'info');
                return {};
            }
        } catch (error) {
            this.log(`Failed to load settings: ${error.message}`, 'error');
            this.settings = {};
            return {};
        }
    }

    // ============================================================================
    // LOGGING SYSTEM
    // These functions provide structured logging for debugging and monitoring
    // DEBUG: Check browser console and server logs for detailed operation tracking
    // ============================================================================

    log(message, level = 'info', data = null) {
        // Enhanced logging with structured data and server logging
        // DEBUG: All application logs go through this function
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            data: data || {},
            url: window.location.pathname,
            userAgent: navigator.userAgent.substring(0, 100)
        };

        // Console logging with appropriate level
        switch (level.toLowerCase()) {
            case 'error':
                console.error(`[${timestamp}] ERROR: ${message}`, data);
                break;
            case 'warn':
                console.warn(`[${timestamp}] WARN: ${message}`, data);
                break;
            case 'debug':
                console.debug(`[${timestamp}] DEBUG: ${message}`, data);
                break;
            default:
                console.log(`[${timestamp}] INFO: ${message}`, data);
        }

        // Send to server for persistent logging (async, non-blocking)
        if (level === 'error' || level === 'warn') {
            this.sendLogToServer(logEntry).catch(err => {
                console.warn('Failed to send log to server:', err);
            });
        }
    }

    async sendLogToServer(logEntry) {
        // Send log entries to server for persistent storage
        // DEBUG: Check server logs endpoint if client logs aren't appearing
        try {
            await fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logEntry)
            });
        } catch (error) {
            // Don't log this error to avoid infinite loops
            console.warn('Failed to send log to server:', error);
        }
    }

    // ============================================================================
    // MODAL SYSTEM
    // These functions handle popup dialogs and user notifications
    // DEBUG: If modals don't appear, check CSS z-index and DOM structure
    // ============================================================================

    setupModals() {
        // Initialize modal system
        // DEBUG: Check if modal container exists in DOM
        if (!document.getElementById('modal-overlay')) {
            const modalHTML = `
                <div id="modal-overlay" class="modal-overlay hidden">
                    <div class="modal">
                        <div class="modal-header">
                            <h3 id="modal-title">Title</h3>
                            <button id="modal-close" class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div id="modal-content">Content</div>
                        </div>
                        <div class="modal-footer">
                            <button id="modal-cancel" class="btn btn-secondary">Cancel</button>
                            <button id="modal-confirm" class="btn btn-primary">OK</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Setup modal event listeners
            const closeModal = () => this.hideModal();
            document.getElementById('modal-close').addEventListener('click', closeModal);
            document.getElementById('modal-cancel').addEventListener('click', closeModal);
            document.getElementById('modal-overlay').addEventListener('click', (e) => {
                if (e.target.id === 'modal-overlay') closeModal();
            });
        }
    }

    showModal(title, content, options = {}) {
        // Display modal dialog with customizable options
        // DEBUG: If modal doesn't show, check if setupModals() was called
        const modal = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const cancelBtn = document.getElementById('modal-cancel');
        const confirmBtn = document.getElementById('modal-confirm');

        if (!modal) {
            this.log('Modal system not initialized', 'error');
            return;
        }

        // Set content
        titleEl.textContent = title;
        if (typeof content === 'string') {
            contentEl.innerHTML = content;
        } else {
            contentEl.appendChild(content);
        }

        // Configure buttons
        const showCancel = options.showCancel !== false;
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
        confirmBtn.textContent = options.confirmText || 'OK';

        // Setup confirm handler
        const confirmHandler = () => {
            if (options.onConfirm) {
                options.onConfirm();
            }
            this.hideModal();
        };

        // Remove existing listeners and add new ones
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        document.getElementById('modal-confirm').addEventListener('click', confirmHandler);

        // Show modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        this.log('Modal displayed', 'debug', { title, hasOptions: !!options });
    }

    hideModal() {
        // Hide currently displayed modal
        const modal = document.getElementById('modal-overlay');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            this.log('Modal hidden', 'debug');
        }
    }

    // ============================================================================
    // SPINNER AND PROGRESS SYSTEM
    // These functions handle loading indicators and operation progress
    // DEBUG: If spinners don't show/hide properly, check these functions
    // ============================================================================

    setupSpinner() {
        // Initialize spinner system
        // DEBUG: Check if spinner container exists in DOM
        if (!document.getElementById('spinner-overlay')) {
            const spinnerHTML = `
                <div id="spinner-overlay" class="spinner-overlay spinner hidden">
                    <div class="spinner-container">
                        <div class="spinner-content">
                            <div class="spinner-header">
                                <h3 id="spinner-title">Loading...</h3>
                                <div id="spinner-header-btn-container">
                                    <button id="spinner-cancel" class="cancel-btn">Cancel</button>
                                </div>
                            </div>
                            <div id="spinner-steps" class="spinner-steps"></div>
                            <div id="spinner-progress" class="spinner-progress hidden"></div>
                            <div id="spinner-footer-btn-container" class="spinner-footer-btn-container hidden">
                                <button id="spinner-close" class="close-btn">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', spinnerHTML);

            // Setup cancel button
            document.getElementById('spinner-cancel').addEventListener('click', () => {
                this.cancelCurrentOperation();
            });
            document.getElementById('spinner-close').addEventListener('click', () => {
                this.hideSpinner();
            });
        }
    }

    cancelCurrentOperation() {
        // Cancel current operation and hide spinner
        // DEBUG: Call this function to stop long-running operations
        this.stopProgressSimulation();
        this.hideSpinner();
        this.log('Operation cancelled by user', 'info');
    }

    showSpinner(text = 'Loading...', showSteps = false) {
        // Show basic loading spinner
        // DEBUG: If spinner doesn't appear, check CSS classes and DOM structure
        const spinner = document.getElementById('spinner-overlay');
        const title = document.getElementById('spinner-title');
        const steps = document.getElementById('spinner-steps');
        const progress = document.getElementById('spinner-progress');

        if (!spinner) {
            this.log('Spinner system not initialized', 'error');
            return;
        }

        title.textContent = text;
        steps.style.display = showSteps ? 'block' : 'none';
        progress.classList.add('hidden');
        
        spinner.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        this.log('Spinner displayed', 'debug', { text, showSteps });
    }

    showOperationSpinner(message, fileName = null) {
        // Show enhanced spinner for operations with workflow steps
        // DEBUG: Use this for complex operations that need step-by-step progress
        const spinner = document.getElementById('spinner-overlay');
        const title = document.getElementById('spinner-title');
        const steps = document.getElementById('spinner-steps');
        const progress = document.getElementById('spinner-progress');

        if (!spinner) {
            this.log('Spinner system not initialized', 'error');
            return;
        }

        // Set title with file info if provided
        let titleText = message;
        if (fileName) {
            titleText += ` (${fileName})`;
        }
        
        title.textContent = titleText;
        steps.style.display = 'block';
        steps.innerHTML = ''; // Clear previous steps
        progress.classList.add('hidden');
        
        // Reset button to Cancel in header
        const headerBtn = document.getElementById('spinner-header-btn-container');
        const footerBtn = document.getElementById('spinner-footer-btn-container');
        if (headerBtn) headerBtn.classList.remove('hidden');
        if (footerBtn) footerBtn.classList.add('hidden');
        document.getElementById('spinner-cancel').textContent = 'Cancel';
        
        spinner.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        this.log('Operation spinner displayed', 'debug', { message, fileName });
    }

    addSpinnerStep(stepText, status = 'loading', stepId = null, icon = null) {
        // Add a step to the operation spinner
        // DEBUG: If steps don't appear, check step HTML structure and CSS
        const stepsContainer = document.getElementById('spinner-steps');
        if (!stepsContainer) return;

        const stepElement = document.createElement('div');
        stepElement.className = `spinner-step ${status}`;
        if (stepId) {
            stepElement.id = stepId;
        }

        // Determine icon based on status
        let stepIcon = icon;
        if (!stepIcon) {
            switch (status) {
                case 'loading':
                    stepIcon = '🔄';
                    break;
                case 'success':
                    stepIcon = '✅';
                    break;
                case 'error':
                    stepIcon = '❌';
                    break;
                default:
                    stepIcon = '📋';
            }
        }

        stepElement.innerHTML = `
            <div class="step-content">
                <span class="step-icon">${stepIcon}</span>
                <span class="step-text">${stepText}</span>
                <span class="step-status"></span>
            </div>
        `;

        stepsContainer.appendChild(stepElement);

        this.log('Spinner step added', 'debug', { stepText, status, stepId });
    }

    startWorkflowSteps() {
        // Initialize standard workflow steps for operations
        // DEBUG: Check if steps are added in correct order
        const stepsContainer = document.getElementById('spinner-steps');
        if (stepsContainer) {
            stepsContainer.innerHTML = ''; // Clear existing steps
        }

        this.addSpinnerStep('🔄 Requesting Worker Token', 'loading', 'step-credentials');
        this.log('Workflow steps initialized', 'debug');
    }

    updateTokenStep(accessToken, expiresIn) {
        // Update token step with expiration information
        // DEBUG: Check if token expiration time is calculated correctly
        const stepElement = document.getElementById('step-credentials');
        if (stepElement) {
            const expiresInMinutes = Math.round(expiresIn / 60);
            const stepText = `✅ Worker Token Received (expires in ${expiresInMinutes} min)`;
            stepElement.querySelector('.step-text').textContent = stepText;
            stepElement.className = 'spinner-step success';
        }
        this.log('Token step updated', 'debug', { expiresIn });
    }

    addFileLoadingStep(fileName, recordCount) {
        // Add file loading step with record count
        this.addSpinnerStep(`📁 Loading CSV file: ${fileName} (${recordCount} records detected)`, 'success', 'step-file');
    }

    addProcessingStep() {
        // Add processing step (will be updated with progress)
        this.addSpinnerStep('🔢 Processing records...', 'loading', 'step-processing');
    }

    updateProcessingProgress(current, total, operation = 'Processing') {
        // Update processing step with current progress
        // DEBUG: Check if progress updates are called with correct parameters
        const stepElement = document.getElementById('step-processing');
        if (stepElement) {
            const stepText = `🔢 ${operation} records: ${current}/${total}`;
            stepElement.querySelector('.step-text').textContent = stepText;
            
            // Update progress display
            const progressElement = document.getElementById('spinner-progress');
            if (progressElement) {
                progressElement.classList.remove('hidden');
                progressElement.textContent = `${operation}: ${current} / ${total}`;
            }
        }
        this.log('Processing progress updated', 'debug', { current, total, operation });
    }

    addFinalizingStep(successCount, errorCount, operation) {
        // Add final step with operation results
        const stepText = `✅ ${operation} completed: ${successCount} successful, ${errorCount} failed`;
        this.addSpinnerStep(stepText, 'success', 'step-finalizing');
        
        // Hide progress display
        const progressElement = document.getElementById('spinner-progress');
        if (progressElement) {
            progressElement.classList.add('hidden');
        }
        
        this.log('Finalizing step added', 'debug', { successCount, errorCount, operation });
    }

    startProgressSimulation(totalRecords, estimatedDurationMs = 10000, fileName = null) {
        // Start realistic progress simulation for operations
        // DEBUG: If progress doesn't update smoothly, check timing calculations
        this.stopProgressSimulation(); // Stop any existing simulation
        
        const updateInterval = 500; // Update every 500ms
        const minTimePerRecord = 150; // Minimum 150ms per record
        const actualDuration = Math.max(estimatedDurationMs, totalRecords * minTimePerRecord);
        
        let currentRecord = 0;
        const incrementPerUpdate = totalRecords / (actualDuration / updateInterval);
        
        this.progressSimulationActive = true;
        
        this.progressInterval = setInterval(() => {
            if (!this.progressSimulationActive) {
                clearInterval(this.progressInterval);
                return;
            }
            
            currentRecord = Math.min(currentRecord + incrementPerUpdate, totalRecords);
            const displayRecord = Math.floor(currentRecord);
            
            this.updateSpinnerProgress(displayRecord, totalRecords, 'Importing');
            
            if (displayRecord >= totalRecords) {
                this.stopProgressSimulation();
            }
        }, updateInterval);
        
        this.log('Progress simulation started', 'debug', { 
            totalRecords, 
            estimatedDurationMs: actualDuration,
            fileName 
        });
    }

    stopProgressSimulation() {
        // Stop progress simulation
        this.progressSimulationActive = false;
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateSpinnerProgress(current, total, action = 'Processing') {
        // Update spinner progress display
        const progressElement = document.getElementById('spinner-progress');
        if (progressElement) {
            progressElement.classList.remove('hidden');
            progressElement.textContent = `${action}: ${current} / ${total}`;
        }
    }

    completeOperationSpinner(successCount, failedCount = 0) {
        // Complete operation spinner with final results
        this.stopProgressSimulation();
        
        // Update final step
        const stepElement = document.getElementById('step-processing');
        if (stepElement) {
            stepElement.querySelector('.step-text').textContent = `✅ Operation completed: ${successCount} successful, ${failedCount} failed`;
            stepElement.className = 'spinner-step success';
        }
        
        // Hide progress
        const progressElement = document.getElementById('spinner-progress');
        if (progressElement) {
            progressElement.classList.add('hidden');
        }
        
        // Move button to footer and change to Close
        const headerBtn = document.getElementById('spinner-header-btn-container');
        const footerBtn = document.getElementById('spinner-footer-btn-container');
        if (headerBtn) headerBtn.classList.add('hidden');
        if (footerBtn) footerBtn.classList.remove('hidden');
        
        this.log('Operation spinner completed', 'debug', { successCount, failedCount });
    }

    failOperationSpinner(stepId, error) {
        // Mark operation spinner as failed
        this.stopProgressSimulation();
        
        const stepElement = document.getElementById(stepId);
        if (stepElement) {
            stepElement.querySelector('.step-text').textContent = `❌ Operation failed: ${error}`;
            stepElement.className = 'spinner-step error';
        }
        
        // Move button to footer and change to Close
        const headerBtn = document.getElementById('spinner-header-btn-container');
        const footerBtn = document.getElementById('spinner-footer-btn-container');
        if (headerBtn) headerBtn.classList.add('hidden');
        if (footerBtn) footerBtn.classList.remove('hidden');
        
        this.log('Operation spinner failed', 'error', { stepId, error });
    }

    hideSpinner() {
        // Hide spinner and clean up
        // DEBUG: If spinner doesn't hide, check if this function is called
        const spinner = document.getElementById('spinner-overlay');
        if (spinner) {
            spinner.classList.add('hidden');
            document.body.style.overflow = '';
            
            // Clean up progress simulation
            this.stopProgressSimulation();
            
            this.log('Spinner hidden', 'debug');
        }
    }

    // ============================================================================
    // UTILITY FUNCTIONS
    // General purpose helper functions for data processing and validation
    // DEBUG: These functions provide common utilities used throughout the app
    // ============================================================================

    async parseCSV(file) {
        // Parse CSV file using Papa Parse library
        // DEBUG: If CSV parsing fails, check file format and encoding
        return new Promise((resolve, reject) => {
            if (!window.Papa) {
                reject(new Error('Papa Parse library not loaded'));
                return;
            }

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    this.log('CSV parsing completed', 'debug', {
                        filename: file.name,
                        recordCount: results.data.length,
                        errors: results.errors.length
                    });
                    resolve(results);
                },
                error: (error) => {
                    this.log('CSV parsing failed', 'error', { error: error.message });
                    reject(error);
                }
            });
        });
    }

    validateEmail(email) {
        // Validate email address format
        // DEBUG: Check this regex if email validation isn't working
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    validateRequired(value, fieldName) {
        // Validate required field
        if (!value || value.toString().trim() === '') {
            throw new Error(`${fieldName} is required`);
        }
        return true;
    }

    formatDate(date) {
        // Format date for display
        return new Date(date).toLocaleDateString();
    }

    formatDateTime(date) {
        // Format date and time for display
        return new Date(date).toLocaleString();
    }

    formatFileSize(bytes) {
        // Convert bytes to human-readable format
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    handleError(error, context = '') {
        // Centralized error handling
        // DEBUG: All application errors should go through this function
        const errorMessage = error.message || 'Unknown error occurred';
        const errorContext = context ? ` in ${context}` : '';
        
        this.log(`Error${errorContext}: ${errorMessage}`, 'error', {
            context,
            stack: error.stack,
            error: error
        });

        // Show user-friendly error message
        this.showModal('Error', `An error occurred${errorContext}: ${errorMessage}`, {
            showCancel: false,
            confirmText: 'OK'
        });
    }

    async makeRequest(url, options = {}) {
        // Enhanced fetch wrapper with error handling and logging
        // DEBUG: Use this for all API requests to get consistent error handling
        const requestId = Math.random().toString(36).substr(2, 9);
        
        this.log('Making API request', 'debug', {
            requestId,
            url,
            method: options.method || 'GET',
            hasBody: !!options.body
        });

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            this.log('API response received', 'debug', {
                requestId,
                url,
                status: response.status,
                statusText: response.statusText
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            this.log('API request failed', 'error', {
                requestId,
                url,
                error: error.message
            });
            throw error;
        }
    }

    setupSidebar() {
        // Setup sidebar functionality (placeholder)
        // DEBUG: Add sidebar-specific initialization here
        this.log('Sidebar setup completed', 'debug');
    }
}

// Initialize utils when DOM is loaded
// DEBUG: If utils aren't available globally, check this initialization
document.addEventListener('DOMContentLoaded', () => {
    window.utils = new Utils();
    console.log('Utils initialized and available globally as window.utils');
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
} 
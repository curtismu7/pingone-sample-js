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
        
        // Abort controller for cancelling operations
        this.currentOperationController = null;
        
        // SSE connection for real-time progress
        this.sseConnection = null;
        this.currentOperationId = null;

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

    getStoredCredentials() {
        // Alias for getSettings for consistency with settings page
        return this.getSettings();
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
                            <!-- Header Section -->
                            <div class="spinner-header">
                                <div class="spinner-header-main">
                                    <div class="spinner-icon-container">
                                        <div class="spinner-icon"></div>
                                    </div>
                                    <div class="spinner-title-section">
                                        <h3 id="spinner-title">Processing Operation</h3>
                                        <div id="spinner-subtitle" class="spinner-subtitle">Initializing...</div>
                                    </div>
                                </div>
                                <div id="spinner-header-btn-container" class="spinner-header-actions">
                                    <button id="spinner-cancel" class="cancel-btn">Cancel Operation</button>
                                </div>
                            </div>

                            <!-- Operation Details Section -->
                            <div id="spinner-details" class="spinner-details">
                                <div class="operation-info">
                                    <div class="info-row">
                                        <span class="info-label">Operation Type:</span>
                                        <span id="operation-type" class="info-value">-</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">File:</span>
                                        <span id="operation-file" class="info-value">-</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Records:</span>
                                        <span id="operation-records" class="info-value">-</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Started:</span>
                                        <span id="operation-start-time" class="info-value">-</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Elapsed Time:</span>
                                        <span id="operation-elapsed" class="info-value">-</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Progress Section -->
                            <div id="spinner-progress-section" class="spinner-progress-section">
                                <div class="progress-header">
                                    <span class="progress-label">Overall Progress</span>
                                    <span id="progress-percentage" class="progress-percentage">0%</span>
                                </div>
                                <div class="progress-bar-container">
                                    <div id="progress-bar" class="progress-bar">
                                        <div id="progress-fill" class="progress-fill"></div>
                                    </div>
                                </div>
                                <div id="spinner-progress" class="spinner-progress hidden"></div>
                            </div>

                            <!-- Real-time Stats Section -->
                            <div id="spinner-stats" class="spinner-stats">
                                <div class="stats-header">
                                    <span class="stats-label">Current Status</span>
                                </div>
                                <div class="stats-content">
                                    <div class="stats-row">
                                        <span class="stats-label">Success:</span>
                                        <span class="stats-value success">0</span>
                                    </div>
                                    <div class="stats-row">
                                        <span class="stats-label">Errors:</span>
                                        <span class="stats-value error">0</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Steps Section -->
                            <div id="spinner-steps" class="spinner-steps"></div>

                            <!-- Status Summary -->
                            <div id="spinner-status-summary" class="spinner-status-summary hidden">
                                <div class="status-summary-header">
                                    <h4>Operation Summary</h4>
                                </div>
                                <div class="status-summary-content">
                                    <div class="summary-row">
                                        <span class="summary-label">Successful:</span>
                                        <span id="summary-success" class="summary-value success">0</span>
                                    </div>
                                    <div class="summary-row">
                                        <span class="summary-label">Failed:</span>
                                        <span id="summary-failed" class="summary-value error">0</span>
                                    </div>
                                    <div class="summary-row">
                                        <span class="summary-label">Total Time:</span>
                                        <span id="summary-time" class="summary-value">-</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Footer Section -->
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
        if (this.currentOperationController) {
            this.log('User cancelled operation', 'warn');
            this.currentOperationController.abort();
            this.failOperationSpinner('step-processing', 'Operation cancelled by user.');
        }
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

    showOperationSpinner(message, fileName = null, operationType = null, recordCount = null) {
        // Create a new AbortController for this operation
        this.currentOperationController = new AbortController();

        this.showSpinner(message, true);
        this.startSpinnerAnimation();
        
        // Show enhanced spinner for operations with workflow steps
        // DEBUG: Use this for complex operations that need step-by-step progress
        const spinner = document.getElementById('spinner-overlay');
        const title = document.getElementById('spinner-title');
        const subtitle = document.getElementById('spinner-subtitle');
        const steps = document.getElementById('spinner-steps');
        const progress = document.getElementById('spinner-progress');

        if (!spinner) {
            this.log('Spinner system not initialized', 'error');
            return;
        }

        // Set title and subtitle
        title.textContent = message;
        subtitle.textContent = 'Initializing operation...';
        
        // Update operation details
        this.updateOperationDetails(operationType, fileName, recordCount);
        
        // Initialize progress
        this.updateProgress(0, 100);
        
        // Show sections
        steps.style.display = 'block';
        steps.innerHTML = ''; // Clear previous steps
        progress.classList.add('hidden');
        
        // Reset button to Cancel in header
        const headerBtn = document.getElementById('spinner-header-btn-container');
        const footerBtn = document.getElementById('spinner-footer-btn-container');
        const statusSummary = document.getElementById('spinner-status-summary');
        if (headerBtn) headerBtn.classList.remove('hidden');
        if (footerBtn) footerBtn.classList.add('hidden');
        if (statusSummary) statusSummary.classList.add('hidden');
        document.getElementById('spinner-cancel').textContent = 'Cancel Operation';
        
        // Start operation timer
        this.operationStartTime = Date.now();
        this.updateElapsedTime();
        this.elapsedTimer = setInterval(() => this.updateElapsedTime(), 1000);
        
        spinner.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        this.log('Operation spinner displayed', 'debug', { message, fileName, operationType, recordCount });
    }

    updateOperationDetails(operationType, fileName, recordCount) {
        // Update operation details in the spinner
        const typeElement = document.getElementById('operation-type');
        const fileElement = document.getElementById('operation-file');
        const recordsElement = document.getElementById('operation-records');
        const startTimeElement = document.getElementById('operation-start-time');

        if (typeElement) typeElement.textContent = operationType || '-';
        if (fileElement) fileElement.textContent = fileName || '-';
        if (recordsElement) recordCount ? recordsElement.textContent = recordCount.toLocaleString() : recordsElement.textContent = '-';
        if (startTimeElement) startTimeElement.textContent = this.formatDateTime(new Date());
    }

    updateProgress(current, total) {
        // Update progress bar and percentage
        const progressFill = document.getElementById('progress-fill');
        const progressPercentage = document.getElementById('progress-percentage');
        
        if (progressFill && progressPercentage) {
            const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
            progressFill.style.width = `${percentage}%`;
            progressPercentage.textContent = `${percentage}%`;
        }
    }

    updateElapsedTime() {
        // Update elapsed time display
        const elapsedElement = document.getElementById('operation-elapsed');
        if (elapsedElement && this.operationStartTime) {
            const elapsed = Date.now() - this.operationStartTime;
            elapsedElement.textContent = this.formatElapsedTime(elapsed);
        }
    }

    formatElapsedTime(milliseconds) {
        // Format elapsed time in a readable format
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    updateSpinnerSubtitle(text) {
        // Update the subtitle text
        const subtitle = document.getElementById('spinner-subtitle');
        if (subtitle) {
            subtitle.textContent = text;
        }
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
        // Start progress simulation for operations
        // DEBUG: Check if progress updates are called with correct parameters
        this.stopProgressSimulation();
        this.progressSimulationActive = true;
        
        // Calculate dynamic increment based on record count
        let incrementPerUpdate;
        if (totalRecords <= 10) {
            incrementPerUpdate = 1;
        } else if (totalRecords <= 50) {
            incrementPerUpdate = 5;
        } else if (totalRecords <= 200) {
            incrementPerUpdate = 10;
        } else if (totalRecords <= 1000) {
            incrementPerUpdate = 25;
        } else {
            incrementPerUpdate = 100;
        }

        const totalUpdates = Math.ceil(totalRecords / incrementPerUpdate);
        const timePerUpdate = estimatedDurationMs / totalUpdates;
        let currentProgress = 0;

        this.progressInterval = setInterval(() => {
            if (!this.progressSimulationActive) return;

            currentProgress = Math.min(currentProgress + incrementPerUpdate, totalRecords);
            
            // Update progress bar
            this.updateProgress(currentProgress, totalRecords);
            
            // Update processing step text
            const stepElement = document.getElementById('step-processing');
            if (stepElement) {
                const stepText = `🔢 Processing records: ${currentProgress.toLocaleString()}/${totalRecords.toLocaleString()}`;
                stepElement.querySelector('.step-text').textContent = stepText;
            }
            
            // Update subtitle
            this.updateSpinnerSubtitle(`Processing ${currentProgress.toLocaleString()} of ${totalRecords.toLocaleString()} records...`);

            if (currentProgress >= totalRecords) {
                this.stopProgressSimulation();
            }
        }, timePerUpdate);
        
        this.log('Progress simulation started', 'debug', { 
            totalRecords, 
            estimatedDurationMs,
            fileName,
            incrementPerUpdate,
            totalUpdates,
            timePerUpdate
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
        // Complete the operation spinner with final results
        this.stopProgressSimulation();
        this.stopElapsedTimer();
        
        // Update final step
        const stepElement = document.getElementById('step-processing');
        if (stepElement) {
            const stepText = `✅ Operation completed: ${successCount} successful, ${failedCount} failed`;
            stepElement.querySelector('.step-text').textContent = stepText;
            stepElement.className = 'spinner-step success';
        }
        
        // Update subtitle
        this.updateSpinnerSubtitle('Operation completed successfully');
        
        // Show status summary
        this.showStatusSummary(successCount, failedCount);
        
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
        
        // Add event listener to close button to handle completion
        const closeBtn = document.getElementById('spinner-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.handleSpinnerCompletion();
        }
        
        this.log('Operation spinner completed', 'debug', { successCount, failedCount });
    }

    handleSpinnerCompletion() {
        // Handle what happens when spinner is closed after completion
        this.hideSpinner();
        
        // Remove any error popups or modals
        this.hideModal();
        
        // Clear any error messages
        this.clearErrorMessages();
        
        // Return to main page (scroll to top)
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Show results panel if we have results data
        this.showResultsPanel();
        
        this.log('Spinner completion handled', 'debug');
    }

    clearErrorMessages() {
        // Clear any error messages or popups
        const errorElements = document.querySelectorAll('.error-details, .error-message, .alert-error');
        errorElements.forEach(element => {
            element.classList.add('hidden');
            element.innerHTML = '';
        });
        
        // Clear any console errors display
        const consoleErrors = document.querySelectorAll('.console-error, .debug-error');
        consoleErrors.forEach(element => {
            element.remove();
        });
    }

    showResultsPanel() {
        // Show the results panel at the bottom of the page
        const resultsPanel = document.getElementById('results-panel');
        if (resultsPanel) {
            resultsPanel.classList.remove('hidden');
            
            // Scroll to results panel
            setTimeout(() => {
                resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500);
        }
    }

    failOperationSpinner(stepId, error) {
        this.stopProgressSimulation();
        this.stopElapsedTimer();

        // Ensure endTime is set before formatting to prevent errors
        if (!this.endTime) {
            this.endTime = new Date();
        }

        const stepElement = document.getElementById(stepId);
        if (stepElement) {
            stepElement.querySelector('.step-text').textContent = `❌ Operation failed: ${error}`;
            stepElement.className = 'spinner-step error';
        }
        
        // Update subtitle
        this.updateSpinnerSubtitle('Operation failed');
        
        // Show status summary with 0 success
        this.showStatusSummary(0, 1);
        
        // Move button to footer and change to Close
        const headerBtn = document.getElementById('spinner-header-btn-container');
        const footerBtn = document.getElementById('spinner-footer-btn-container');
        if (headerBtn) headerBtn.classList.add('hidden');
        if (footerBtn) footerBtn.classList.remove('hidden');
        
        // Add event listener to close button to handle completion
        const closeBtn = document.getElementById('spinner-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.handleSpinnerCompletion();
        }
        
        this.log('Operation spinner failed', 'debug', { stepId, error });
    }

    showStatusSummary(successCount, failedCount) {
        // Show the status summary section
        const statusSummary = document.getElementById('spinner-status-summary');
        const successElement = document.getElementById('summary-success');
        const failedElement = document.getElementById('summary-failed');
        const timeElement = document.getElementById('summary-time');
        
        // Defensive: default to 0 if undefined or not a number
        if (typeof successCount !== 'number' || isNaN(successCount)) successCount = 0;
        if (typeof failedCount !== 'number' || isNaN(failedCount)) failedCount = 0;
        
        if (statusSummary && successElement && failedElement && timeElement) {
            successElement.textContent = successCount.toLocaleString();
            failedElement.textContent = failedCount.toLocaleString();
            // Calculate total time
            if (this.operationStartTime) {
                const totalTime = Date.now() - this.operationStartTime;
                timeElement.textContent = this.formatElapsedTime(totalTime);
            }
            statusSummary.classList.remove('hidden');
        }
    }

    stopElapsedTimer() {
        // Stop the elapsed time timer
        if (this.elapsedTimer) {
            clearInterval(this.elapsedTimer);
            this.elapsedTimer = null;
        }
    }

    hideSpinner() {
        // Disconnect SSE when hiding spinner
        this.disconnectProgress();
        
        // Hide the spinner overlay
        const spinner = document.getElementById('spinner-overlay');
        if (spinner) {
            spinner.classList.add('hidden');
            this.stopSpinnerAnimation();
        }
        
        this.log('Spinner hidden', 'debug');
    }

    startSpinnerAnimation() {
        // Start the spinner icon animation
        const spinnerIcon = document.querySelector('.spinner-icon');
        if (spinnerIcon) {
            spinnerIcon.classList.add('spinning');
        }
    }

    stopSpinnerAnimation() {
        // Stop the spinner icon animation
        const spinnerIcon = document.querySelector('.spinner-icon');
        if (spinnerIcon) {
            spinnerIcon.classList.remove('spinning');
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
                    resolve(results.data);
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

    // Connect to SSE for real-time progress updates
    connectToProgress(operationId) {
        if (this.sseConnection) {
            this.sseConnection.close();
        }

        this.currentOperationId = operationId;
        this.sseConnection = new EventSource(`/api/import/progress/${operationId}`);
        
        this.sseConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleProgressUpdate(data);
            } catch (error) {
                this.log('Error parsing SSE data', 'error', { error: error.message });
            }
        };

        this.sseConnection.onerror = (error) => {
            this.log('SSE connection error', 'error', { error });
        };
    }

    // Handle real-time progress updates from backend
    handleProgressUpdate(data) {
        switch (data.type) {
            case 'connected':
                this.log('SSE connected', 'debug', { operationId: data.operationId });
                this.updateSpinnerSubtitle('Connected to server, starting operation...');
                break;
                
            case 'progress':
                // Throttle progress updates to prevent too frequent updates
                if (!this.lastProgressUpdate || Date.now() - this.lastProgressUpdate > 500) {
                    this.updateSpinnerProgress(data.current, data.total, data.message);
                    this.updateSpinnerSubtitle(data.message || `Processing ${data.current}/${data.total} records...`);
                    this.lastProgressUpdate = Date.now();
                }
                
                // Update success/error counts if available
                if (data.success !== undefined && data.errors !== undefined) {
                    this.updateSpinnerStats(data.success, data.errors);
                }
                break;
                
            case 'complete':
                this.updateSpinnerProgress(data.current, data.total, data.message);
                this.updateSpinnerSubtitle(data.message || 'Operation completed successfully');
                this.stopSpinnerAnimation();
                
                // Show completion summary
                setTimeout(() => {
                    this.completeOperationSpinner(data.success, data.errors);
                }, 1000);
                break;
                
            case 'error':
                this.updateSpinnerSubtitle(`Error: ${data.message}`);
                this.failOperationSpinner('step-processing', data.message);
                break;
                
            case 'status':
                // Handle status updates specifically
                this.updateSpinnerSubtitle(data.message || 'Processing...');
                break;
        }
    }

    // Update spinner statistics
    updateSpinnerStats(success, errors) {
        const statsElement = document.getElementById('spinner-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                <div class="stats-row">
                    <span class="stats-label">Success:</span>
                    <span class="stats-value success">${success}</span>
                </div>
                <div class="stats-row">
                    <span class="stats-label">Errors:</span>
                    <span class="stats-value error">${errors}</span>
                </div>
            `;
        }
    }

    // Disconnect SSE connection
    disconnectProgress() {
        if (this.sseConnection) {
            this.sseConnection.close();
            this.sseConnection = null;
        }
        this.currentOperationId = null;
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
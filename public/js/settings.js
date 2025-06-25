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

    getUpdateCurrentLogDisplayFunction() {
        return (directory, fileName) => {
            const currentFileDisplay = document.getElementById('current-log-file');
            if (currentFileDisplay && directory) {
                const fileNameInput = document.getElementById('log-file-name');
                const logFileName = fileName || (fileNameInput ? fileNameInput.value.trim() : 'app.log');
                const fullPath = directory.endsWith('/') ? `${directory}${logFileName}` : `${directory}/${logFileName}`;
                
                // Truncate the path for display if it's too long
                const displayPath = fullPath.length > 45 
                    ? `...${fullPath.substring(fullPath.length - 42)}` 
                    : fullPath;
                    
                currentFileDisplay.textContent = displayPath;
                currentFileDisplay.title = fullPath; // Show full path on hover
            }
        };
    }

    async init() {
        console.log('SettingsPage.init() started');
        
        try {
            // Wait for required dependencies
            await this.waitForUtils();
            await this.waitForDOM();
            await this.waitForTippy();
            console.log('Tippy.js is available');
            
            this.initializeTooltips();
            this.setupEventListeners();
            await this.loadSettings();
            this.setupModifyFields();
            this.initializeLoggingControls();
            this.setupFilePicker();
            
            // Load initial log file name if available
            this.updateDefaultFileDisplay();
            
            // Update current log file display with initial values
            const filePathInput = document.getElementById('log-file-path');
            const fileNameInput = document.getElementById('log-file-name');
            if (filePathInput && fileNameInput) {
                const updateCurrentLogDisplay = this.getUpdateCurrentLogDisplayFunction();
                updateCurrentLogDisplay(
                    filePathInput.value.trim(), 
                    fileNameInput.value.trim()
                );
            }
        } catch (error) {
            console.error('Error initializing settings page:', error);
            if (window.utils && typeof window.utils.log === 'function') {
                window.utils.log('Error initializing settings page: ' + error.message, 'error');
            }
            
            // Show error to user
            const errorElement = document.getElementById('init-error');
            if (errorElement) {
                errorElement.textContent = 'Failed to initialize settings: ' + error.message;
                errorElement.style.display = 'block';
            }
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
        // Handle form inputs - save immediately on change
        var form = document.getElementById('credentials-form');
        if (form) {
            // Save text inputs on change and blur
            form.querySelectorAll('input[type="text"], input[type="password"], input[type="url"], input[type="number"], textarea, select').forEach(function(input) {
                input.addEventListener('change', function() { 
                    this.saveSetting(input.name, input.value); 
                }.bind(this));
                input.addEventListener('blur', function() { 
                    this.saveSetting(input.name, input.value); 
                }.bind(this));
            }.bind(this));
            
            // Save checkboxes and radio buttons on change
            form.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function(input) {
                input.addEventListener('change', function() { 
                    const value = input.type === 'checkbox' ? input.checked : input.value;
                    this.saveSetting(input.name, value); 
                    
                    // Toggle client secret field visibility
                    if (input.id === 'use-client-secret') {
                        this.toggleClientSecretField(input.checked);
                    }
                }.bind(this));
            }.bind(this));

            // Advanced section toggle
            const advancedHeader = document.getElementById('advanced-header');
            if (advancedHeader) {
                advancedHeader.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleAdvancedSection(event);
                });
            }
            
            // Toggle password visibility for client secret
            const toggleSecret = document.getElementById('toggle-secret');
            if (toggleSecret) {
                toggleSecret.addEventListener('click', () => {
                    const secretInput = document.getElementById('client-secret');
                    if (secretInput) {
                        const type = secretInput.type === 'password' ? 'text' : 'password';
                        secretInput.type = type;
                        toggleSecret.classList.toggle('fa-eye');
                        toggleSecret.classList.toggle('fa-eye-slash');
                    }
                });
            }
            
            // Initialize client secret field visibility
            const useClientSecret = document.getElementById('use-client-secret');
            if (useClientSecret) {
                this.toggleClientSecretField(useClientSecret.checked);
            }
        }

        // Logging controls
        const startLoggingBtn = document.getElementById('start-logging-btn');
        const stopLoggingBtn = document.getElementById('stop-logging-btn');
        const exportLogBtn = document.getElementById('export-log-btn');
        const clearLogBtn = document.getElementById('clear-log-btn');
        const updateLogFileBtn = document.getElementById('update-log-file');
        const testButton = document.getElementById('test-credentials');

        // Set up event listeners for logging controls
        if (startLoggingBtn) startLoggingBtn.addEventListener('click', () => this.toggleLogging(true));
        if (stopLoggingBtn) stopLoggingBtn.addEventListener('click', () => this.toggleLogging(false));
        if (exportLogBtn) exportLogBtn.addEventListener('click', () => this.exportLog());
        if (clearLogBtn) clearLogBtn.addEventListener('click', () => this.clearLog());
        
        // Set up log file update button
        if (updateLogFileBtn) {
            updateLogFileBtn.addEventListener('click', () => this.updateLogFileName());
        }
        
        // Initialize file picker for log directory selection
        this.setupFilePicker();
        if (testButton) testButton.addEventListener('click', () => this.testCredentials());
        
        // Handle file input changes
        const fileInput = document.getElementById('default-file');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    this.saveSetting('defaultFile', file.name);
                    await this.processCsvFile(file);
                } else {
                    this.hideFileInfo();
                }
            });
        }
    }

    setupModifyFields() {
        // Define the user attributes to be modified
        const userAttributes = [
            { id: 'username', label: 'Username', description: 'User login identifier' },
            { id: 'email', label: 'Email', description: 'User email address' },
            { id: 'givenName', label: 'First Name', description: 'User first name' },
            { id: 'surname', label: 'Last Name', description: 'User last name' },
            { id: 'displayName', label: 'Display Name', description: 'Name displayed in the UI' },
            { id: 'title', label: 'Job Title', description: 'User job title' },
            { id: 'department', label: 'Department', description: 'User department' },
            { id: 'employeeNumber', label: 'Employee ID', description: 'Employee identification number' },
            { id: 'mobilePhone', label: 'Mobile Phone', description: 'User mobile phone number' },
            { id: 'phoneNumber', label: 'Work Phone', description: 'User work phone number' },
            { id: 'address', label: 'Address', description: 'User physical address' },
            { id: 'city', label: 'City', description: 'User city' },
            { id: 'state', label: 'State/Province', description: 'User state or province' },
            { id: 'postalCode', label: 'Postal Code', description: 'User postal/zip code' },
            { id: 'country', label: 'Country', description: 'User country' },
            { id: 'timezone', label: 'Timezone', description: 'User timezone' },
            { id: 'preferredLanguage', label: 'Language', description: 'User preferred language' },
            { id: 'manager', label: 'Manager', description: 'User manager' },
            { id: 'groups', label: 'Groups', description: 'User group memberships' },
            { id: 'active', label: 'Account Status', description: 'Whether the account is active' }
        ];

        // Get the grid container
        const grid = document.getElementById('modify-fields-grid');
        if (!grid) return;

        // Clear existing content
        grid.innerHTML = '';

        // Add checkboxes for each attribute
        userAttributes.forEach(attr => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `
                <label class="checkbox-label">
                    <input type="checkbox" id="modify-${attr.id}" name="modifyFields" value="${attr.id}">
                    <span>${attr.label}</span>
                    <span class="tooltip-icon" data-tippy-content="${attr.description}">i</span>
                </label>
            `;
            grid.appendChild(div);
        });

        // Initialize tooltips for the new elements
        this.initializeTooltips();

        // Add event listeners for the checkboxes
        const checkboxes = document.querySelectorAll('#modify-fields-grid input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.updateSelectAllCheckbox();
                // Save the setting
                this.saveSetting('modifyFields', Array.from(document.querySelectorAll('#modify-fields-grid input[name="modifyFields"]:checked')).map(cb => cb.value));
            });
        });

        // Add event listener for select all checkbox
        const selectAll = document.getElementById('select-all-modify-fields');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => this.toggleAllModifyFields(e.target.checked));
        }

        // Load saved settings
        this.loadModifyFieldsSettings();
    }

    async saveSetting(key, value) {
        try {
            // Don't save if key or value is undefined
            if (key === undefined || value === undefined) {
                console.warn('Skipping save: key or value is undefined', { key, value });
                return;
            }
            
            // Log the save action for debugging
            console.log(`Saving setting: ${key} =`, value);
            
            // Save setting to local storage or API
            if (window.utils && typeof window.utils.saveSetting === 'function') {
                await window.utils.saveSetting(key, value);
                
                // Show feedback for important settings
                if (['environmentId', 'clientId', 'baseUrl'].includes(key)) {
                    this.showSaveFeedback(`Setting saved: ${key}`);
                }
            }
        } catch (error) {
            console.error('Error saving setting:', error);
            this.showSaveFeedback(`Error saving ${key}`, 'error');
        }
    }
    
    // Show feedback when settings are saved
    showSaveFeedback(message, type = 'success') {
        // Check if we already have a feedback element
        let feedbackEl = document.getElementById('settings-feedback');
        
        if (!feedbackEl) {
            // Create feedback element if it doesn't exist
            feedbackEl = document.createElement('div');
            feedbackEl.id = 'settings-feedback';
            feedbackEl.style.position = 'fixed';
            feedbackEl.style.bottom = '20px';
            feedbackEl.style.right = '20px';
            feedbackEl.style.padding = '10px 20px';
            feedbackEl.style.borderRadius = '4px';
            feedbackEl.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            feedbackEl.style.zIndex = '1000';
            feedbackEl.style.transition = 'opacity 0.3s';
            document.body.appendChild(feedbackEl);
        }
        
        // Set message and style based on type
        feedbackEl.textContent = message;
        feedbackEl.style.backgroundColor = type === 'error' ? '#f8d7da' : '#d4edda';
        feedbackEl.style.color = type === 'error' ? '#721c24' : '#155724';
        feedbackEl.style.border = `1px solid ${type === 'error' ? '#f5c6cb' : '#c3e6cb'}`;
        feedbackEl.style.opacity = '1';
        
        // Auto-hide after 3 seconds
        clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = setTimeout(() => {
            if (feedbackEl) {
                feedbackEl.style.opacity = '0';
                // Remove element after fade out
                setTimeout(() => {
                    if (feedbackEl && document.body.contains(feedbackEl)) {
                        document.body.removeChild(feedbackEl);
                    }
                }, 300);
            }
        }, 3000);
    }

    async loadSettings() {
        try {
            // Load settings from local storage or API
            if (window.utils && typeof window.utils.getSettings === 'function') {
                const settings = await window.utils.getSettings();
                // Apply settings to form
                Object.entries(settings).forEach(([key, value]) => {
                    const input = document.querySelector(`[name="${key}"]`);
                    if (input) {
                        if (input.type === 'checkbox') {
                            input.checked = !!value;
                        } else {
                            input.value = value || '';
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            throw error;
        }
    }

    updateDefaultFileDisplay() {
        // Update UI to show the default file name if set
        if (this.defaultFileName) {
            const fileNameDisplay = document.getElementById('default-file-name');
            if (fileNameDisplay) {
                fileNameDisplay.textContent = this.defaultFileName;
            }
        }
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all-modify-fields');
        if (!selectAllCheckbox) return;
        
        const checkboxes = Array.from(document.querySelectorAll('#modify-fields-grid input[type="checkbox"][name="modifyFields"]'));
        const allChecked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);
        const someChecked = checkboxes.some(checkbox => checkbox.checked);
        
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = someChecked && !allChecked;
    }

    toggleAllModifyFields(checked) {
        const checkboxes = document.querySelectorAll('#modify-fields-grid input[type="checkbox"][name="modifyFields"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        // Save the updated settings
        this.saveSetting('modifyFields', checked ? 
            Array.from(checkboxes).map(cb => cb.value) : 
            []
        );
    }
    
    async loadModifyFieldsSettings() {
        try {
            const settings = await window.utils.getSettings();
            if (settings.modifyFields && Array.isArray(settings.modifyFields)) {
                const checkboxes = document.querySelectorAll('#modify-fields-grid input[name="modifyFields"]');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = settings.modifyFields.includes(checkbox.value);
                });
                this.updateSelectAllCheckbox();
            }
        } catch (error) {
            console.error('Error loading modify fields settings:', error);
        }
    }

    async testCredentials() {
        const button = document.getElementById('test-credentials');
        const loadingElement = document.getElementById('test-credentials-loading');
        const statusElement = document.getElementById('test-credentials-status');
        const maxRetries = 3;
        let retryCount = 0;
        let lastError = null;
        
        // Helper function to update status
        const updateStatus = (text, type = '') => {
            if (!statusElement) return;
            statusElement.textContent = text;
            statusElement.className = 'status-message';
            if (type) statusElement.classList.add(type);
        };
        
        // Validate elements exist
        if (!button) {
            console.error('Test credentials button not found');
            return false;
        }
        
        // Set loading state
        button.disabled = true;
        if (loadingElement) loadingElement.style.display = 'inline-block';
        updateStatus('Testing connection...');
        
        try {
            // Save settings first
            await this.saveAllSettings();
            
            // Get values from form
            const environmentId = document.getElementById('environment-id').value.trim();
            const clientId = document.getElementById('client-id').value.trim();
            const useClientSecret = document.getElementById('use-client-secret')?.checked || false;
            let clientSecret = '';
            
            if (useClientSecret) {
                clientSecret = document.getElementById('client-secret')?.value.trim() || '';
                if (!clientSecret) {
                    throw new Error('Client secret is required when "Use Client Secret" is checked');
                }
            }
            
            // Validate required fields
            if (!environmentId || !clientId) {
                throw new Error('Please fill in all required fields');
            }
            
            // Retry logic
            while (retryCount < maxRetries) {
                try {
                    // Add a small delay between retries (except first attempt)
                    if (retryCount > 0) {
                        updateStatus(`Retrying (${retryCount}/${maxRetries - 1})...`, 'warning');
                        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                    }
                    
                    // Test credentials with or without client secret
                    const response = await window.utils.testCredentials(environmentId, clientId, clientSecret);
                    
                    if (response && response.success) {
                        updateStatus('Connection successful!', 'success');
                        return true;
                    } else {
                        throw new Error(response?.error || 'Failed to validate credentials');
                    }
                    
                } catch (error) {
                    lastError = error;
                    
                    // Check if this is a rate limit error (429)
                    if (error.status === 429) {
                        const retryAfter = error.retryAfter || 5; // Default to 5 seconds if no retry-after header
                        updateStatus(`Rate limited. Waiting ${retryAfter}s before retry...`, 'warning');
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    } else {
                        // For non-rate-limit errors, rethrow to be caught by the outer catch
                        throw error;
                    }
                }
                
                retryCount++;
            }
            
            // If we've exhausted retries, throw the last error
            throw lastError || new Error('Maximum retry attempts reached');
            
        } catch (error) {
            console.error('Error testing credentials:', error);
            updateStatus(`Error: ${error.message || 'Failed to validate credentials'}`, 'error');
            throw error;
            
        } finally {
            // Reset loading state
            if (button) button.disabled = false;
            if (loadingElement) loadingElement.style.display = 'none';
        }
    }

    async saveAllSettings() {
        var form = document.getElementById('credentials-form');
        if (!form) return;
        
        var formData = new FormData(form);
        var settings = {};
        var _this = this;
        
        // Convert FormData to plain object
        formData.forEach(function(value, key) {
            settings[key] = value;
        });
        
        // Handle checkboxes that might not be in form data when unchecked
        form.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
            settings[checkbox.name] = checkbox.checked;
        });
        
        try {
            if (window.utils && typeof window.utils.saveSettings === 'function') {
                await window.utils.saveSettings(settings);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error saving settings:', error);
            throw error;
        }
    }

    // Initialize logging controls to their default state
    initializeLoggingControls() {
        const startBtn = document.getElementById('start-logging-btn');
        const stopBtn = document.getElementById('stop-logging-btn');
        const statusElement = document.getElementById('logging-status');
        
        if (!startBtn || !stopBtn || !statusElement) {
            console.error('Required logging elements not found');
            return;
        }
        
        // Set initial state (both buttons visible but one disabled)
        startBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
        startBtn.disabled = false;
        stopBtn.disabled = false;
        
        // Set initial status
        const statusText = statusElement.querySelector('.status-value');
        const statusIcon = statusElement.querySelector('.status-icon');
        if (statusText) statusText.textContent = 'Inactive';
        if (statusIcon) statusIcon.textContent = '✗';
        statusElement.className = 'status-display inactive';
    }

    // Toggle logging on/off
    async toggleLogging(enable) {
        const startBtn = document.getElementById('start-logging-btn');
        const stopBtn = document.getElementById('stop-logging-btn');
        const statusElement = document.getElementById('logging-status');
        const loadingElement = document.getElementById('logging-loading');
        
        if (!startBtn || !stopBtn || !statusElement) {
            console.error('Required elements not found for logging toggle');
            return false;
        }
        
        // Show loading state and disable buttons
        if (loadingElement) loadingElement.style.display = 'inline-block';
        startBtn.disabled = true;
        stopBtn.disabled = true;
        
        try {
            // Add a small delay to prevent rapid toggling
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Update UI immediately for better responsiveness
            if (enable) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-flex';
            } else {
                startBtn.style.display = 'inline-flex';
                stopBtn.style.display = 'none';
            }
            
            const response = await fetch(`/api/logs/${enable ? 'start' : 'stop'}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    timestamp: new Date().toISOString()
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                // If we get a 400 and logging was not running, treat it as success
                if (response.status === 400 && data.error === 'Logging was not running') {
                    // Update UI to show logging is already stopped
                    const statusText = statusElement.querySelector('.status-value');
                    const statusIcon = statusElement.querySelector('.status-icon');
                    
                    statusElement.classList.remove('active', 'error');
                    statusElement.classList.add('inactive');
                    if (statusText) statusText.textContent = 'Inactive';
                    if (statusIcon) statusIcon.textContent = '✗';
                    
                    // Update button states
                    startBtn.style.display = 'inline-flex';
                    stopBtn.style.display = 'none';
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    
                    return true;
                }
                
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            
            if (data.success) {
                // Update UI to reflect logging state
                const statusText = statusElement.querySelector('.status-value');
                const statusIcon = statusElement.querySelector('.status-icon');
                
                if (enable) {
                    statusElement.classList.remove('inactive');
                    statusElement.classList.add('active');
                    if (statusText) statusText.textContent = 'Active';
                    if (statusIcon) statusIcon.textContent = '✓';
                } else {
                    statusElement.classList.remove('active');
                    statusElement.classList.add('inactive');
                    if (statusText) statusText.textContent = 'Inactive';
                    if (statusIcon) statusIcon.textContent = '✗';
                }
                
                // Show success message
                if (window.utils && typeof window.utils.showSuccessMessage === 'function') {
                    window.utils.showSuccessMessage(`Logging ${enable ? 'started' : 'stopped'} successfully`);
                }
                
                return true;
            } else {
                throw new Error(data.error || 'Failed to toggle logging');
            }
        } catch (error) {
            console.error('Error toggling logging:', error);
            
            // Revert UI if there was an error
            if (enable) {
                startBtn.style.display = 'inline-flex';
                stopBtn.style.display = 'none';
                startBtn.disabled = false;
                stopBtn.disabled = true;
            } else {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-flex';
                startBtn.disabled = true;
                stopBtn.disabled = false;
            }
            
            // Update status text
            const statusText = statusElement.querySelector('.status-value');
            const statusIcon = statusElement.querySelector('.status-icon');
            
            if (statusText) statusText.textContent = enable ? 'Start Failed' : 'Stop Failed';
            if (statusIcon) statusIcon.textContent = '!';
            statusElement.className = 'status-display error';
            
            // Show error message
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(`Failed to ${enable ? 'start' : 'stop'} logging: ${error.message}`);
            } else {
                alert(`Error: ${error.message}`);
            }
            
            // Reset status after delay
            setTimeout(() => {
                statusElement.textContent = enable ? 'Inactive' : 'Active';
                statusElement.className = `status-badge ${enable ? 'inactive' : 'active'}`;
            }, 3000);
            
            return false;
        } finally {
            // Always re-enable the buttons and hide loading
            startBtn.disabled = false;
            stopBtn.disabled = false;
            if (loadingElement) loadingElement.style.display = 'none';
        }
    }
    
    // Export log file
    exportLog() {
        const exportBtn = document.getElementById('export-log-btn');
        const statusElement = document.getElementById('export-status');
        
        // Prevent multiple clicks
        if (exportBtn && exportBtn.disabled) {
            return;
        }
        
        // Update UI for loading state
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
        }
        
        if (statusElement) {
            statusElement.textContent = 'Preparing log export...';
            statusElement.className = 'info';
        }
        
        try {
            // Create a hidden iframe to handle the download
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            // Set the iframe's src to trigger the download
            iframe.src = '/api/logs/export';
            
            // Clean up after a short delay to ensure the download starts
            const cleanup = () => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                
                if (exportBtn) {
                    exportBtn.disabled = false;
                    exportBtn.innerHTML = '<i class="fas fa-file-export"></i> Export Logs';
                }
                
                if (statusElement) {
                    statusElement.textContent = 'Log export completed';
                    statusElement.className = 'success';
                    
                    // Clear success message after 5 seconds
                    setTimeout(() => {
                        if (statusElement.textContent === 'Log export completed') {
                            statusElement.textContent = '';
                            statusElement.className = '';
                        }
                    }, 5000);
                }
            };
            
            // Set a timeout to clean up the iframe and reset the UI
            setTimeout(cleanup, 2000);
            
            // Also clean up if the iframe's load event fires
            iframe.onload = cleanup;
            
        } catch (error) {
            console.error('Error exporting log:', error);
            
            // Show error message using standard popup
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(
                    'Export Failed',
                    error.message || 'Failed to export log file. Please try again.',
                    { duration: 10000, showCloseButton: true }
                );
            } else {
                alert('Error: ' + (error.message || 'Failed to export log'));
            }
            
            // Reset button state on error
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-file-export"></i> Export Logs';
            }
            
            if (statusElement) {
                statusElement.textContent = 'Export failed';
                statusElement.className = 'error';
                
                // Clear error message after 10 seconds
                setTimeout(() => {
                    if (statusElement.textContent === 'Export failed') {
                        statusElement.textContent = '';
                        statusElement.className = '';
                    }
                }, 10000);
            }
        }
    }
    
    // Toggle advanced section
    toggleAdvancedSection(event) {
        const header = event.currentTarget;
        const content = document.getElementById('advanced-content');
        const icon = header.querySelector('i');
        
        if (content) {
            content.classList.toggle('show');
            
            // Toggle icon
            if (icon) {
                if (content.classList.contains('show')) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                } else {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                }
            }
            
            // Save the state to localStorage
            const isExpanded = content.classList.contains('show');
            localStorage.setItem('advancedSectionExpanded', isExpanded);
        }
    }

    // Toggle client secret field visibility
    toggleClientSecretField(show) {
        const clientSecretGroup = document.querySelector('.client-secret-group');
        if (clientSecretGroup) {
            clientSecretGroup.style.display = show ? 'block' : 'none';
        }
    }
    
    // Clear log file
    async clearLog() {
        const clearBtn = document.getElementById('clear-log-btn');
        
        // Prevent multiple clicks
        if (clearBtn && clearBtn.disabled) {
            return;
        }
        
        // Save original button state
        const originalText = clearBtn ? clearBtn.innerHTML : '';
        let originalBtnState = clearBtn ? clearBtn.disabled : false;
        
        try {
            // Set loading state
            if (clearBtn) {
                clearBtn.disabled = true;
                clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';
            }
            
            // Use the standard confirmation dialog
            const confirmed = await new Promise((resolve) => {
                if (window.utils && typeof window.utils.showConfirmDialog === 'function') {
                    window.utils.showConfirmDialog(
                        'Clear Log File',
                        'Are you sure you want to clear the log file? This action cannot be undone.',
                        'warning',
                        (result) => resolve(result)
                    );
                } else {
                    resolve(confirm('Are you sure you want to clear the log file? This cannot be undone.'));
                }
            });
            
            if (!confirmed) {
                return;
            }
            
            const response = await fetch('/api/logs', { 
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
                }
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to clear log');
            }
            
            // Show success message using standard popup
            if (window.utils && typeof window.utils.showSuccessMessage === 'function') {
                window.utils.showSuccessMessage(
                    'Log File Cleared',
                    'The log file has been cleared successfully.',
                    { duration: 5000, showCloseButton: true }
                );
            } else {
                alert('Log file has been cleared successfully');
            }
            
            // Refresh log display if on logs page
            if (typeof window.refreshLogs === 'function') {
                window.refreshLogs();
            }
            
        } catch (error) {
            console.error('Error clearing log:', error);
            
            // Show error message using standard popup
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(
                    'Clear Log Failed',
                    error.message || 'Failed to clear log file. Please try again.',
                    { duration: 10000, showCloseButton: true }
                );
            } else {
                alert('Error: ' + (error.message || 'Failed to clear log'));
            }
        } finally {
            // Always reset button state
            if (clearBtn) {
                clearBtn.disabled = originalBtnState;
                clearBtn.innerHTML = originalText;
            }
        }
    }
    
    // Reset the update button to its default state
    resetUpdateButton() {
        const updateBtn = document.getElementById('update-log-file');
        if (updateBtn) {
            updateBtn.innerHTML = '<i class="fas fa-save"></i> Save';
            updateBtn.classList.remove('btn-success', 'btn-error');
            updateBtn.disabled = false;
        }
    }
    
    // Setup file picker for directory selection
    setupFilePicker() {
        const browseButton = document.getElementById('browse-button');
        const filePicker = document.getElementById('log-file-picker');
        const filePathInput = document.getElementById('log-file-path');
        const fileNameInput = document.getElementById('log-file-name');
        
        if (!browseButton || !filePicker || !filePathInput || !fileNameInput) return;
        
        // Store the directory handle if using File System Access API
        this.directoryHandle = null;
        
        // Reset update button when directory or filename changes
        filePathInput.addEventListener('input', () => this.resetUpdateButton());
        fileNameInput.addEventListener('input', () => this.resetUpdateButton());
        
        // Get the update function for current log file display
        const updateCurrentLogDisplay = this.getUpdateCurrentLogDisplayFunction();

        // Handle browse button click - use mousedown to ensure we have user activation
        browseButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            
            // Use a small timeout to ensure the click event is properly registered
            setTimeout(() => {
                // Use the modern File System Access API if available
                if ('showDirectoryPicker' in window) {
                    this.handleModernFilePicker(filePathInput, updateCurrentLogDisplay);
                } else {
                    // Fallback to using the file input with webkitdirectory
                    filePicker.click();
                }
            }, 100);
        });
        
        // Handle directory selection with webkitdirectory fallback
        filePicker.addEventListener('change', (event) => {
            const files = event.target.files;
            if (files.length > 0) {
                try {
                    // Get the directory path from the first selected file
                    const filePath = files[0].path;
                    if (filePath) {
                        const directoryPath = filePath.substring(0, filePath.lastIndexOf('/') + 1);
                        
                        // Update the input field with the selected directory path
                        filePathInput.value = directoryPath;
                        
                        // Update the log file name input field with the default log file name
                        const fileNameInput = document.getElementById('log-file-name');
                        if (fileNameInput && !fileNameInput.value) {
                            fileNameInput.value = 'app.log';
                        }
                        
                        // Update the current log file display
                        updateCurrentLogDisplay(directoryPath, fileNameInput ? fileNameInput.value : null);
                    } else {
                        console.warn('Could not determine directory path from file selection');
                        this.showSaveFeedback('Could not determine directory path. Please try again.', 'error');
                    }
                } catch (error) {
                    console.error('Error processing directory selection:', error);
                    this.showSaveFeedback('Error processing directory selection. Please try again.', 'error');
                }
                
                // Reset the file input to allow selecting the same directory again
                filePicker.value = '';
            }
        });
    }
    
    // Handle modern File System Access API for directory selection
    async handleModernFilePicker(filePathInput, updateCurrentLogDisplay) {
        try {
            const directoryHandle = await window.showDirectoryPicker({
                id: 'logDirectory',
                mode: 'readwrite',
                startIn: 'documents'
            });
            
            // If we get here, user has selected a directory
            // With the File System Access API, we can't get the full path due to security restrictions
            const dirName = directoryHandle.name;
            filePathInput.value = dirName;
            this.directoryHandle = directoryHandle;
            
            // Update the log file name input field with the default log file name
            const fileNameInput = document.getElementById('log-file-name');
            if (fileNameInput) {
                if (!fileNameInput.value) {
                    fileNameInput.value = 'app.log';
                }
                // Reset the update button when directory is selected
                this.resetUpdateButton();
            }
            
            // Update the current log file display
            updateCurrentLogDisplay(dirName, fileNameInput ? fileNameInput.value : null);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting directory:', error);
                this.showSaveFeedback('Error selecting directory. Please try again.', 'error');
            }
        }
    }
    
    // Update log file name and location
    async updateLogFileName() {
        const fileNameInput = document.getElementById('log-file-name');
        const filePathInput = document.getElementById('log-file-path');
        const currentFileDisplay = document.getElementById('current-log-file');
        const updateBtn = document.getElementById('update-log-file');
        
        if (!fileNameInput || !filePathInput || !currentFileDisplay || !updateBtn) {
            console.error('Required elements not found:', { 
                fileNameInput: !!fileNameInput,
                filePathInput: !!filePathInput,
                currentFileDisplay: !!currentFileDisplay, 
                updateBtn: !!updateBtn 
            });
            throw new Error('Required UI elements not found');
        }
        
        const newFileName = fileNameInput.value.trim();
        let directoryPath = filePathInput.value.trim();
        
        // Validate inputs
        if (!newFileName) {
            throw new Error('Please enter a file name');
        }
        
        // If using File System Access API, we can't get the full path due to security restrictions
        // So we'll let the server handle the default directory
        const isUsingModernAPI = 'showDirectoryPicker' in window && this.directoryHandle;
        
        if (!isUsingModernAPI && !directoryPath) {
            throw new Error('Please select a directory for the log file');
        }
        
        // Validate file name format - allow letters, numbers, spaces, hyphens, underscores, and periods
        const fileNameRegex = /^[\w\-\s.]+$/;
        if (!fileNameRegex.test(newFileName)) {
            throw new Error('File name can only contain letters, numbers, spaces, hyphens, underscores, and periods');
        }
        
        // Ensure the file has a .log extension
        if (!newFileName.endsWith('.log')) {
            throw new Error('Log file name must end with .log');
        }
        
        // Save original button state
        const originalBtnText = updateBtn.innerHTML;
        const originalBtnClass = updateBtn.className;
        updateBtn.disabled = true;
        updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        updateBtn.classList.remove('btn-success', 'btn-error');
        
        try {
            // Prepare the request data with both directory and filename
            const requestData = {
                fileName: newFileName
            };
            
            // Only include directory if we're not using the modern API
            if (!isUsingModernAPI && directoryPath) {
                requestData.directory = directoryPath;
            }
            
            const response = await fetch('/api/logs/update-filename', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
                },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                let errorMessage = data.error || data.message || 'Failed to update log file name';
                if (data.details) {
                    console.debug('Log file update error details:', data.details);
                    errorMessage += ` (${typeof data.details === 'string' ? data.details : JSON.stringify(data.details)})`;
                }
                throw new Error(errorMessage);
            }
            
            // If there was no change needed, show appropriate message and return
            if (data.noChange) {
                this.showSaveFeedback(data.message, 'info');
                return;
            }
            
            // Update the current log file display with full path
            const fullPath = data.filePath || (directoryPath ? 
                `${directoryPath}${directoryPath.endsWith('/') ? '' : '/'}${newFileName}` : 
                newFileName);
                
            const displayPath = fullPath.length > 40 
                ? '...' + fullPath.substring(fullPath.length - 40) 
                : fullPath;
                
            currentFileDisplay.textContent = displayPath;
            currentFileDisplay.title = fullPath; // Show full path on hover
            
            // Update any other elements showing the current log file name
            const logFileNameElements = document.querySelectorAll('.current-log-file');
            logFileNameElements.forEach(el => {
                if (el !== currentFileDisplay) {
                    el.textContent = displayPath;
                    el.title = fullPath;
                }
            });
            
            // Show success message
            let successMessage = data.message || 'Log file location updated successfully';
            if (data.loggingRestarted) {
                successMessage += ' and logging was restarted';
            }
            
            this.showSaveFeedback(successMessage, 'success');
            
            // Update button to show success state
            updateBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
            updateBtn.classList.add('btn-success');
            updateBtn.disabled = false;
            
            // Update the log manager config if it exists
            if (window.logManager) {
                window.logManager.config.logFile = fullPath;
            }
            
            // Clear the input fields
            filePathInput.value = '';
            fileNameInput.value = '';
            
        } catch (error) {
            console.error('Error updating log file name:', error);
            let errorMessage = error.message || 'Failed to update log file name';
            
            // Handle specific error cases
            if (error.message.includes('already exists')) {
                errorMessage = 'A log file with this name already exists. Please choose a different name.';
            } else if (error.message.includes('permission denied')) {
                errorMessage = 'Permission denied. Unable to update log file name.';
            } else if (error.message.includes('ENOENT')) {
                errorMessage = 'The specified directory does not exist or is not accessible.';
            }
            
            this.showSaveFeedback(errorMessage, 'error');
            
            // Update button to show error state
            updateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
            updateBtn.classList.add('btn-error');
            updateBtn.disabled = false;
            
            // Fallback error handling if showSaveFeedback fails
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(
                    'Update Failed',
                    error.message || 'An error occurred while updating the log file name.',
                    { duration: 10000, showCloseButton: true }
                );
            } else {
                console.error('Error updating log file:', error);
            }
            
            // Always restore button state
            setTimeout(() => {
                updateBtn.disabled = false;
                updateBtn.innerHTML = originalBtnText;
                updateBtn.className = originalBtnClass;
            }, 2000);
        }
    }
    
    // Process uploaded CSV file
    async processCsvFile(file) {
        if (!file || !file.name.endsWith('.csv')) {
            this.hideFileInfo();
            return;
        }
        
        try {
            // Show loading state
            this.showFileInfoLoading();
            
            // Read file as text
            const text = await this.readFileAsText(file);
            
            // Parse CSV (simple parsing for headers and first row as sample)
            const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
            if (lines.length === 0) {
                throw new Error('CSV file is empty');
            }
            
            // Parse headers and first data row
            const headers = this.parseCsvLine(lines[0]);
            const sampleRow = lines.length > 1 ? this.parseCsvLine(lines[1]) : [];
            
            // Update UI with file info
            this.updateFileInfo(file, headers, sampleRow);
            
        } catch (error) {
            console.error('Error processing CSV file:', error);
            this.updateStatus(`Error processing file: ${error.message}`, 'error');
            this.hideFileInfo();
        }
    }
    
    // Read file as text
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }
    
    // Parse a single CSV line (simple implementation, may need enhancement for complex CSVs)
    parseCsvLine(line) {
        // Simple CSV parsing - splits on commas not inside quotes
        const result = [];
        let inQuotes = false;
        let currentField = '';
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        
        // Add the last field
        result.push(currentField.trim());
        return result;
    }
    
    // Show file info section with loading state
    showFileInfoLoading() {
        const fileInfoSection = document.getElementById('file-info-section');
        if (fileInfoSection) {
            fileInfoSection.style.display = 'block';
            fileInfoSection.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i> Processing file...
                </div>`;
        }
    }
    
    // Update file info in the UI
    updateFileInfo(file, headers, sampleRow) {
        const fileInfoSection = document.getElementById('file-info-section');
        if (!fileInfoSection) return;
        
        // Format file size
        const formatFileSize = (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };
        
        // Format last modified date
        const formatDate = (date) => {
            return new Date(date).toLocaleString();
        };
        
        // Update file metadata
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-size').textContent = formatFileSize(file.size);
        document.getElementById('file-modified').textContent = formatDate(file.lastModified);
        
        // Update headers table
        const tbody = document.querySelector('#csv-headers-table tbody');
        if (tbody) {
            tbody.innerHTML = '';
            headers.forEach((header, index) => {
                const row = document.createElement('tr');
                const sampleValue = sampleRow[index] || '';
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td><code>${this.escapeHtml(header)}</code></td>
                    <td><span class="sample-value">${this.escapeHtml(sampleValue)}</span></td>
                `;
                tbody.appendChild(row);
            });
        }
        
        // Show the section
        fileInfoSection.style.display = 'block';
    }
    
    // Hide file info section
    hideFileInfo() {
        const fileInfoSection = document.getElementById('file-info-section');
        if (fileInfoSection) {
            fileInfoSection.style.display = 'none';
        }
    }
    
    // Helper to escape HTML for safe display
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Initialize the settings page when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.settingsPage = new SettingsPage();
    });
} else {
    window.settingsPage = new SettingsPage();
}

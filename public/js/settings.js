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
        
        try {
            await this.waitForUtils();
            console.log('Utils are available');
            await this.waitForDOM();
            console.log('DOM is ready');
            await this.waitForTippy();
            console.log('Tippy.js is available');
            
            this.setupEventListeners();
            this.setupModifyFields();
            
            // Load settings but don't auto-start logging
            await this.loadSettings();
            this.initializeTooltips();
            this.updateDefaultFileDisplay();
            this.initializeLoggingControls();
            
            console.log('SettingsPage initialized successfully');
        } catch (error) {
            console.error('Error initializing settings page:', error);
            if (window.utils && typeof window.utils.log === 'function') {
                window.utils.log('Error initializing settings: ' + error.message, 'error');
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
        // Auto-save form inputs
        var form = document.getElementById('credentials-form');
        if (form) {
            // Auto-save on input change for text fields
            form.querySelectorAll('input[type="text"], input[type="password"], input[type="url"]').forEach(function(input) {
                input.addEventListener('change', function() { this.saveSetting(input.name, input.value); }.bind(this));
                input.addEventListener('blur', function() { this.saveSetting(input.name, input.value); }.bind(this));
            }.bind(this));
            
            // Auto-save on change for checkboxes
            form.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
                checkbox.addEventListener('change', function() { this.saveSetting(checkbox.name, checkbox.checked); }.bind(this));
            }.bind(this));
        }

        // Logging controls
        var startLoggingBtn = document.getElementById('start-logging-btn');
        var stopLoggingBtn = document.getElementById('stop-logging-btn');
        var exportLogBtn = document.getElementById('export-log-btn');
        var clearLogBtn = document.getElementById('clear-log-btn');
        var updateLogFileBtn = document.getElementById('update-log-file');

        if (startLoggingBtn) {
            startLoggingBtn.addEventListener('click', function() { this.toggleLogging(true); }.bind(this));
        }
        if (stopLoggingBtn) {
            stopLoggingBtn.addEventListener('click', function() { this.toggleLogging(false); }.bind(this));
        }
        if (exportLogBtn) {
            exportLogBtn.addEventListener('click', function() { this.exportLog(); }.bind(this));
        }
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', function() { this.clearLog(); }.bind(this));
        }
        if (updateLogFileBtn) {
            updateLogFileBtn.addEventListener('click', function() { this.updateLogFileName(); }.bind(this));
        }

        // Save button
        const saveButton = document.getElementById('save-settings');
        if (saveButton) {
            saveButton.addEventListener('click', () => this.saveAllSettings());
        }

        // Test credentials button
        const testButton = document.getElementById('test-credentials');
        if (testButton) {
            testButton.addEventListener('click', () => this.testCredentials());
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
            // Save setting to local storage or API
            if (window.utils && typeof window.utils.saveSetting === 'function') {
                await window.utils.saveSetting(key, value);
            }
        } catch (error) {
            console.error('Error saving setting:', error);
        }
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
            statusElement.className = type;
            
            // Clear success/error messages after 5 seconds
            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    if (statusElement.textContent === text) {
                        statusElement.textContent = '';
                        statusElement.className = '';
                    }
                }, 5000);
            }
        };
        
        // Set initial loading state
        if (button) button.disabled = true;
        if (loadingElement) loadingElement.style.display = 'inline-block';
        updateStatus('Testing connection...');
        
        try {
            // Save settings first
            await this.saveAllSettings();
            
            // Get values from form
            const environmentId = document.getElementById('environment-id').value.trim();
            const clientId = document.getElementById('client-id').value.trim();
            const clientSecret = document.getElementById('client-secret').value.trim();
            
            // Validate required fields
            if (!environmentId || !clientId || !clientSecret) {
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
                    
                    // Test credentials
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
    
    // Update log file name
    async updateLogFileName() {
        const fileNameInput = document.getElementById('log-file-name');
        const currentFileDisplay = document.getElementById('current-log-file');
        const updateBtn = document.getElementById('update-log-file-btn');
        
        if (!fileNameInput || !currentFileDisplay || !updateBtn) return;
        
        const newFileName = fileNameInput.value.trim();
        
        // Validate file name
        if (!newFileName) {
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(
                    'Validation Error',
                    'Please enter a file name',
                    { duration: 5000 }
                );
            } else {
                alert('Please enter a file name');
            }
            return;
        }
        
        // Validate file name format
        const fileNameRegex = /^[\w\-. ]+$/;
        if (!fileNameRegex.test(newFileName)) {
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(
                    'Invalid File Name',
                    'File name can only contain letters, numbers, spaces, hyphens, underscores, and periods',
                    { duration: 7000 }
                );
            } else {
                alert('Invalid file name. Only letters, numbers, spaces, hyphens, underscores, and periods are allowed.');
            }
            return;
        }
        
        // Save original button state
        const originalBtnText = updateBtn.innerHTML;
        const originalBtnState = updateBtn.disabled;
        
        try {
            // Update button to show loading state
            updateBtn.disabled = true;
            updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            
            const response = await fetch('/api/logs/update-filename', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ fileName: newFileName })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Failed to update log file name');
            }
            
            // Update the UI
            currentFileDisplay.textContent = newFileName;
            fileNameInput.value = ''; // Clear the input field
            
            // Show success message
            if (window.utils && typeof window.utils.showSuccessMessage === 'function') {
                window.utils.showSuccessMessage(
                    'Log File Name Updated',
                    'The log file name has been updated successfully.',
                    { duration: 5000, showCloseButton: true }
                );
            } else {
                alert('Log file name updated successfully');
            }
            
        } catch (error) {
            console.error('Error updating log file name:', error);
            
            // Show error message
            if (window.utils && typeof window.utils.showErrorMessage === 'function') {
                window.utils.showErrorMessage(
                    'Update Failed',
                    error.message || 'Failed to update log file name. Please try again.',
                    { duration: 10000, showCloseButton: true }
                );
            } else {
                alert('Error: ' + (error.message || 'Failed to update log file name'));
            }
        } finally {
            // Restore button state
            if (updateBtn) {
                updateBtn.disabled = originalBtnState;
                updateBtn.innerHTML = originalBtnText;
            }
        }
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

// Main page functionality for Ping Identity User Management

class MainPage {
    constructor() {
        this.currentFile = null;
        this.importResults = [];
        this.currentPage = 1;
        this.recordsPerPage = 25;
        this.importInProgress = false;
        this.init();
    }

    async init() {
        await this.waitForUtils();
        this.setupEventListeners();
        this.setupSidebarActions();
        this.loadDefaultFile();
        this.initializeTooltips();
        utils.log('Main page initialized', 'info');
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
        // File upload
        const fileInput = document.getElementById('csv-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // Import buttons
        const importBtn = document.getElementById('import-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importUsers());
        }

        const modifyBtn = document.getElementById('modify-btn');
        if (modifyBtn) {
            modifyBtn.addEventListener('click', () => this.modifyUsers());
        }

        const deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteUsers());
        }

        // Export results
        const exportBtn = document.getElementById('export-results');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportResults());
        }

        // Pagination
        const prevBtn = document.getElementById('prev-page');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousPage());
        }

        const nextBtn = document.getElementById('next-page');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }

        // Drag and drop
        this.setupDragAndDrop();
    }

    setupSidebarActions() {
        const chooseFileLink = document.getElementById('nav-choose-file');
        const importLink = document.getElementById('nav-import-users');
        const modifyLink = document.getElementById('nav-modify-users');
        const deleteLink = document.getElementById('nav-delete-users');

        if (chooseFileLink) {
            chooseFileLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('csv-file').click();
            });
        }

        if (importLink) {
            importLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('import-btn').click();
            });
        }

        if (modifyLink) {
            modifyLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('modify-btn').click();
            });
        }

        if (deleteLink) {
            deleteLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('delete-btn').click();
            });
        }
    }

    setupDragAndDrop() {
        const dropZone = document.querySelector('.file-upload-container');
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = 'var(--ping-red)';
                dropZone.style.backgroundColor = 'var(--ping-red-light)';
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = '#e0e0e0';
                dropZone.style.backgroundColor = 'var(--ping-gray-light)';
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect({ target: { files } });
            }
        });
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            utils.showModal(
                'Invalid File',
                'Please select a CSV file only.',
                { confirmText: 'OK', showCancel: false }
            );
            return;
        }

        this.currentFile = file;
        this.updateFileInfo();
        this.updateCurrentFileDisplay();
        utils.log(`File selected: ${file.name}`, 'info');
    }

    updateFileInfo() {
        const fileInfo = document.getElementById('file-info');
        if (!fileInfo || !this.currentFile) return;

        const info = utils.getFileInfo(this.currentFile);
        fileInfo.innerHTML = `
            <div><strong>File Name:</strong> ${info.name}</div>
            <div><strong>File Size:</strong> ${info.size}</div>
            <div><strong>Last Modified:</strong> ${info.lastModified}</div>
        `;
    }

    updateCurrentFileDisplay() {
        const currentFileSpan = document.getElementById('current-file');
        if (currentFileSpan && this.currentFile) {
            currentFileSpan.textContent = this.currentFile.name;
        }
    }

    async loadDefaultFile() {
        try {
            const settings = localStorage.getItem('pingone-settings');
            if (settings) {
                const parsed = JSON.parse(settings);
                if (parsed.defaultFile) {
                    const currentFileSpan = document.getElementById('current-file');
                    if (currentFileSpan) {
                        currentFileSpan.textContent = parsed.defaultFile;
                    }
                }
            }
        } catch (error) {
            utils.log(`Failed to load default file: ${error.message}`, 'error');
        }
    }

    async importUsers() {
        if (!this.currentFile) {
            utils.showModal(
                'No File Selected',
                'Please select a CSV file first.',
                { confirmText: 'OK', showCancel: false }
            );
            return;
        }

        if (this.importInProgress) {
            utils.showModal(
                'Import in Progress',
                'An import is already in progress. Please wait for it to complete.',
                { confirmText: 'OK', showCancel: false }
            );
            return;
        }

        try {
            this.importInProgress = true;
            utils.showSpinner('Processing file...');
            this.showImportProgress();

            const csvData = await utils.parseCSV(this.currentFile);
            if (!csvData || csvData.length === 0) {
                throw new Error('No data found in CSV file');
            }

            const credentials = this.getCredentials();
            if (!credentials) {
                throw new Error('Please configure your PingOne credentials in the Configuration page');
            }

            utils.showSpinner('Importing users...');
            await this.processImport(csvData, credentials);

        } catch (error) {
            utils.handleError(error, 'importUsers');
        } finally {
            this.importInProgress = false;
            this.hideImportProgress();
            utils.hideSpinner();
        }
    }

    async processImport(csvData, credentials) {
        const totalUsers = csvData.length;
        let processed = 0;
        let successful = 0;
        let failed = 0;

        this.importResults = [];

        // Get worker token
        const token = await utils.getWorkerToken(
            credentials.environmentId,
            credentials.clientId,
            credentials.clientSecret
        );

        if (!token) {
            throw new Error('Failed to obtain authentication token');
        }

        // Process each user
        for (const userData of csvData) {
            try {
                const result = await this.importUser(userData, credentials, token);
                this.importResults.push(result);
                
                if (result.success) {
                    successful++;
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
                this.importResults.push({
                    username: userData.username || 'Unknown',
                    success: false,
                    message: error.message
                });
            }

            processed++;
            this.updateProgress(processed, totalUsers, successful, failed);
        }

        this.showResults();
    }

    async importUser(userData, credentials, token) {
        const mappedData = this.mapUserData(userData);
        
        const response = await fetch('/api/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user: mappedData,
                credentials: credentials
            })
        });

        const result = await response.json();
        
        return {
            username: mappedData.username,
            success: response.ok,
            message: result.message || (response.ok ? 'User imported successfully' : 'Import failed')
        };
    }

    mapUserData(userData) {
        const columnMapping = this.getColumnMapping();
        
        return {
            username: userData[columnMapping.usernameColumn] || userData.username,
            email: userData[columnMapping.emailColumn] || userData.email,
            firstName: userData[columnMapping.firstnameColumn] || userData.firstName,
            lastName: userData[columnMapping.lastnameColumn] || userData.lastName,
            populationId: userData[columnMapping.populationColumn] || userData.populationId
        };
    }

    getCredentials() {
        try {
            const settings = localStorage.getItem('pingone-settings');
            if (settings) {
                const parsed = JSON.parse(settings);
                if (parsed.environmentId && parsed.clientId && parsed.clientSecret) {
                    return {
                        environmentId: parsed.environmentId,
                        clientId: parsed.clientId,
                        clientSecret: parsed.clientSecret,
                        baseUrl: parsed.baseUrl || 'https://api.pingone.com'
                    };
                }
            }
            return null;
        } catch (error) {
            utils.log(`Failed to get credentials: ${error.message}`, 'error');
            return null;
        }
    }

    getColumnMapping() {
        try {
            const settings = localStorage.getItem('pingone-settings');
            if (settings) {
                const parsed = JSON.parse(settings);
                return {
                    usernameColumn: parsed.usernameColumn || 'username',
                    emailColumn: parsed.emailColumn || 'email',
                    firstnameColumn: parsed.firstnameColumn || 'firstName',
                    lastnameColumn: parsed.lastnameColumn || 'lastName',
                    populationColumn: parsed.populationColumn || 'populationId'
                };
            }
            return {
                usernameColumn: 'username',
                emailColumn: 'email',
                firstnameColumn: 'firstName',
                lastnameColumn: 'lastName',
                populationColumn: 'populationId'
            };
        } catch (error) {
            utils.log(`Failed to get column mapping: ${error.message}`, 'error');
            return {
                usernameColumn: 'username',
                emailColumn: 'email',
                firstnameColumn: 'firstName',
                lastnameColumn: 'lastName',
                populationColumn: 'populationId'
            };
        }
    }

    showImportProgress() {
        const progress = document.getElementById('import-progress');
        if (progress) {
            progress.classList.remove('hidden');
        }
    }

    hideImportProgress() {
        const progress = document.getElementById('import-progress');
        if (progress) {
            progress.classList.add('hidden');
        }
    }

    updateProgress(processed, total, successful, failed) {
        const progressFill = document.getElementById('progress-fill');
        const progressStatus = document.getElementById('progress-status');
        const progressCount = document.getElementById('progress-count');

        if (progressFill) {
            const percentage = (processed / total) * 100;
            progressFill.style.width = `${percentage}%`;
        }

        if (progressStatus) {
            progressStatus.textContent = `Processing users... (${successful} successful, ${failed} failed)`;
        }

        if (progressCount) {
            progressCount.textContent = `${processed} / ${total}`;
        }
    }

    showResults() {
        const resultsPanel = document.getElementById('results-panel');
        if (resultsPanel) {
            resultsPanel.classList.remove('hidden');
            this.updateResultsSummary();
            this.displayResultsPage(1);
        }
    }

    updateResultsSummary() {
        const totalRecords = document.getElementById('total-records');
        const successfulCount = document.getElementById('successful-count');
        const failedCount = document.getElementById('failed-count');

        if (totalRecords) {
            totalRecords.textContent = this.importResults.length;
        }

        if (successfulCount) {
            const successful = this.importResults.filter(r => r.success).length;
            successfulCount.textContent = successful;
        }

        if (failedCount) {
            const failed = this.importResults.filter(r => !r.success).length;
            failedCount.textContent = failed;
        }
    }

    displayResultsPage(page) {
        const tbody = document.getElementById('results-tbody');
        if (!tbody) return;

        const startIndex = (page - 1) * this.recordsPerPage;
        const endIndex = startIndex + this.recordsPerPage;
        const pageResults = this.importResults.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        pageResults.forEach(result => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.username}</td>
                <td><span class="status-badge ${result.success ? 'success' : 'error'}">${result.success ? 'Success' : 'Failed'}</span></td>
                <td>${result.message}</td>
                <td>
                    ${!result.success ? `<button class="btn btn-secondary btn-sm" onclick="mainPage.retryImport('${result.username}')">Retry</button>` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });

        this.updatePagination();
    }

    updatePagination() {
        const totalPages = Math.ceil(this.importResults.length / this.recordsPerPage);
        const pageInfo = document.getElementById('page-info');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const pagination = document.getElementById('pagination');

        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
        }

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= totalPages;
        }

        if (pagination) {
            pagination.classList.toggle('hidden', totalPages <= 1);
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.displayResultsPage(this.currentPage);
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.importResults.length / this.recordsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.displayResultsPage(this.currentPage);
        }
    }

    async retryImport(username) {
        const userResult = this.importResults.find(r => r.username === username);
        if (!userResult) return;

        try {
            const credentials = this.getCredentials();
            if (!credentials) {
                throw new Error('Please configure your PingOne credentials');
            }

            const token = await utils.getWorkerToken(
                credentials.environmentId,
                credentials.clientId,
                credentials.clientSecret
            );

            if (!token) {
                throw new Error('Failed to obtain authentication token');
            }

            // Find the original user data from the CSV
            const csvData = await utils.parseCSV(this.currentFile);
            const userData = csvData.find(row => {
                const mapping = this.getColumnMapping();
                return row[mapping.usernameColumn] === username || row.username === username;
            });

            if (!userData) {
                throw new Error('Original user data not found');
            }

            const result = await this.importUser(userData, credentials, token);
            
            // Update the result in the array
            const index = this.importResults.findIndex(r => r.username === username);
            if (index !== -1) {
                this.importResults[index] = result;
            }

            // Refresh the display
            this.updateResultsSummary();
            this.displayResultsPage(this.currentPage);

            utils.showModal(
                'Retry Result',
                result.success ? 'User imported successfully' : `Import failed: ${result.message}`,
                { confirmText: 'OK', showCancel: false }
            );

        } catch (error) {
            utils.handleError(error, 'retryImport');
        }
    }

    async modifyUsers() {
        utils.showModal(
            'Modify Users',
            'User modification functionality will be implemented in a future update.',
            { confirmText: 'OK', showCancel: false }
        );
    }

    async deleteUsers() {
        utils.showModal(
            'Delete Users',
            'User deletion functionality will be implemented in a future update.',
            { confirmText: 'OK', showCancel: false }
        );
    }

    exportResults() {
        try {
            const csv = this.convertResultsToCSV();
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `import-results-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            utils.log('Results exported successfully', 'info');
        } catch (error) {
            utils.handleError(error, 'exportResults');
        }
    }

    convertResultsToCSV() {
        const headers = ['Username', 'Status', 'Message'];
        const rows = this.importResults.map(result => [
            result.username,
            result.success ? 'Success' : 'Failed',
            result.message
        ]);

        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }
}

// Initialize the main page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mainPage = new MainPage();
}); 
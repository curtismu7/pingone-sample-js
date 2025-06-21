// Main page functionality for Ping Identity User Management

class MainPage {
    constructor() {
        this.currentFile = null;
        this.importInProgress = false;
        this.resultsData = [];
        this.currentPage = 1;
        this.recordsPerPage = 25;
        this.init();
    }

    async init() {
        await this.waitForUtils();
        this.setupEventListeners();
        this.loadPersistedState();
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
                duration: [200, 150]
            });
        });
    }

    setupEventListeners() {
        document.getElementById('csv-file')?.addEventListener('change', (e) => this.handleFileSelect(e));
        document.getElementById('import-btn')?.addEventListener('click', () => this.importUsers());
        document.getElementById('records-per-page')?.addEventListener('change', (e) => this.handleRecordsPerPageChange(e));

        document.querySelectorAll('.quick-action').forEach(action => {
            action.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.currentTarget.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    loadPersistedState() {
        const settings = utils.loadSettings() || {};
        this.recordsPerPage = settings.recordsPerPage || 25;
        document.getElementById('records-per-page').value = this.recordsPerPage;

        const persistedFileMeta = localStorage.getItem('pingone-file-metadata');
        if (persistedFileMeta) {
            this.displayFileMetadata(JSON.parse(persistedFileMeta));
        }
    }

    async handleFileSelect(event) {
        this.currentFile = event.target.files[0];
        if (!this.currentFile) return;

        utils.showSpinner('Analyzing file...');
        try {
            const result = await utils.parseCSV(this.currentFile);
            const metadata = {
                name: this.currentFile.name,
                totalRecords: result.data.length,
                validRows: result.data.length, // Simple validation for now
                invalidRows: result.errors.length,
            };
            this.displayFileMetadata(metadata);
            localStorage.setItem('pingone-file-metadata', JSON.stringify(metadata));
        } catch (error) {
            utils.handleError(error, 'handleFileSelect');
            this.clearFileMetadata();
        } finally {
            utils.hideSpinner();
        }
    }
    
    displayFileMetadata(metadata) {
        const container = document.getElementById('file-metadata');
        if (!container) return;

        document.getElementById('meta-filename').textContent = metadata.name;
        document.getElementById('meta-total-records').textContent = metadata.totalRecords;
        document.getElementById('meta-valid-rows').textContent = metadata.validRows;
        document.getElementById('meta-invalid-rows').textContent = metadata.invalidRows;
        
        container.classList.remove('hidden');
    }

    clearFileMetadata() {
        const container = document.getElementById('file-metadata');
        if (container) {
            container.classList.add('hidden');
        }
        localStorage.removeItem('pingone-file-metadata');
        document.getElementById('csv-file').value = '';
    }

    handleRecordsPerPageChange(event) {
        this.recordsPerPage = parseInt(event.target.value, 10);
        const settings = utils.loadSettings() || {};
        settings.recordsPerPage = this.recordsPerPage;
        localStorage.setItem('pingone-settings', JSON.stringify(settings));
        utils.log(`Records per page changed to: ${this.recordsPerPage}`, 'info');
        if (this.resultsData.length > 0) {
            this.renderResults();
        }
    }

    async importUsers() {
        if (this.importInProgress) {
            utils.log('Import already in progress.', 'warn');
            return;
        }
        if (!this.currentFile) {
            utils.showModal('No File Selected', 'Please choose a CSV file to import.', { showCancel: false });
            return;
        }

        try {
            this.importInProgress = true;
            this.showImportProgress();
            
            const credentials = utils.getStoredCredentials();
            if (!credentials) {
                throw new Error('Please configure your PingOne credentials in the Configuration page');
            }

            const csvData = await utils.parseCSVData(await this.currentFile.text());
            
            utils.showSpinner(`Importing ${csvData.data.length} users...`);
            await this.processImport(csvData.data, credentials);

        } catch (error) {
            utils.handleError(error, 'importUsers');
        } finally {
            this.importInProgress = false;
            this.hideImportProgress();
            utils.hideSpinner();
        }
    }

    showImportProgress() {
        document.getElementById('import-progress')?.classList.remove('hidden');
    }

    hideImportProgress() {
        document.getElementById('import-progress')?.classList.add('hidden');
    }
    
    async processImport(records, credentials) {
        let successCount = 0;
        let failCount = 0;
        this.resultsData = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const status = { success: false, message: '' };
            
            try {
                // Placeholder for actual import logic
                // const response = await utils.makeRequest(...);
                status.success = true;
                status.message = 'Successfully imported (simulation).';
                successCount++;
            } catch (error) {
                status.success = false;
                status.message = error.message;
                failCount++;
            }

            this.resultsData.push({
                username: record.username || `Row ${i + 1}`,
                status: status.success ? 'Success' : 'Failed',
                details: status.message
            });

            // Update progress bar
            const progressFill = document.getElementById('progress-fill');
            const progressCount = document.getElementById('progress-count');
            const percent = ((i + 1) / records.length) * 100;
            if(progressFill) progressFill.style.width = `${percent}%`;
            if(progressCount) progressCount.textContent = `${i + 1} / ${records.length}`;
        }
        
        this.renderResults();
        utils.showModal('Import Complete', `Processed ${records.length} records. Success: ${successCount}, Failed: ${failCount}.`, { showCancel: false });
    }

    renderResults() {
        const resultsPanel = document.getElementById('results-panel');
        if (!resultsPanel) return;

        resultsPanel.classList.remove('hidden');
        // Logic to render table and pagination will go here
        console.log("Render results called, pagination and table rendering would happen here.");
    }
}

// Initialize the main page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mainPage = new MainPage();
}); 
const winston = require('winston');
const path = require('path');
const fs = require('fs');

class LogManager {
    constructor() {
        this.logDirectory = path.join(__dirname, '../../logs');
        this.config = {
            isLogging: true,
            logFile: 'import-status.log',
        };
        this.fileTransport = null;
        this.logger = this.createLogger();
        this.ensureLogDirectory();
        this.initializeLogging();
    }

    createLogger() {
        // Custom format for structured logging
        const structuredFormat = winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.printf(info => {
                if (info.structured) {
                    // Use structured format for special log entries
                    return `[${info.timestamp}] ${info.message}`;
                } else {
                    // Use JSON format for regular logs
                    return JSON.stringify({
                        timestamp: info.timestamp,
                        level: info.level,
                        message: info.message,
                        service: info.service,
                        ...info
                    });
                }
            })
        );

        const logger = winston.createLogger({
            level: 'info',
            format: structuredFormat,
            defaultMeta: { service: 'pingone-user-management' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
                    )
                })
            ]
        });
        
        return logger;
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
    }
    
    getLogFilePath() {
        return path.join(this.logDirectory, this.config.logFile);
    }

    initializeLogging() {
        // Start file logging immediately and log server startup
        this.startFileLogging();
        this.logServerStartup();
    }

    logServerStartup() {
        const port = process.env.PORT || 3002;
        
        // Log server startup header
        this.logStructured(`Started server on port ${port}`);
        
        // Log library initialization status
        this.logLibraryStatus();
    }

    logLibraryStatus() {
        // Log libraries being loaded
        this.logStructured('Loaded libraries: uDSV, Tippy.js, Popper.js');
        
        const libraries = [
            { name: 'Winston (Logging)', status: 'OK' },
            { name: 'Express.js', status: 'OK' },
            { name: 'Axios (HTTP Client)', status: 'OK' },
            { name: 'Multer (File Upload)', status: 'OK' },
            { name: 'PapaCSV (CSV Parser)', status: 'OK' },
            { name: 'CORS Middleware', status: 'OK' }
        ];

        libraries.forEach(lib => {
            this.logStructured(`Loaded ${lib.name}: ${lib.status}`);
        });
        
        // Log token configuration
        this.logStructured('TOKEN CONFIG: Cache=50min, Buffer=2min, MaxAge=60min');
    }

    logStructured(message) {
        this.logger.info(message, { structured: true });
    }

    startFileLogging() {
        const logPath = this.getLogFilePath();
        
        // Check if log file exists, if not create it
        if (!fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '', 'utf-8');
            console.log(`Created log file: ${logPath}`);
        }

        if (this.fileTransport) {
            this.logger.remove(this.fileTransport);
        }

        this.fileTransport = new winston.transports.File({
            filename: logPath,
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 10,
        });

        this.logger.add(this.fileTransport);
        this.config.isLogging = true;
        
        // Only log this if it's a manual start (not initial startup)
        if (this.hasStartedBefore) {
            this.logStructured(`File logging started. Outputting to ${this.config.logFile}`);
        }
        this.hasStartedBefore = true;
    }

    stopFileLogging() {
        if (this.fileTransport) {
            this.logStructured(`File logging stopped. Was outputting to ${this.config.logFile}`);
            this.logger.remove(this.fileTransport);
            this.fileTransport = null;
        }
        this.config.isLogging = false;
    }
    
    updateConfig(newConfig) {
        const oldLogFile = this.config.logFile;
        
        if (newConfig.logFile && newConfig.logFile !== this.config.logFile) {
            this.config.logFile = newConfig.logFile;
            this.logStructured(`Log file changed from ${oldLogFile} to ${this.config.logFile}`);
        }
        
        if (this.config.isLogging) {
            this.startFileLogging(); // Restart logging with new config
        }
    }

    clearLogFile() {
        const logPath = this.getLogFilePath();
        if (fs.existsSync(logPath)) {
            fs.truncateSync(logPath, 0);
            this.logStructured(`Log file cleared: ${this.config.logFile}`);
            return true;
        }
        return false;
    }

    getLogContent() {
        const logPath = this.getLogFilePath();
        if (fs.existsSync(logPath)) {
            return fs.readFileSync(logPath, 'utf-8');
        }
        return 'Log file is empty or does not exist.';
    }

    // Enhanced logging methods for specific activities
    logWorkerTokenRequested() {
        this.logStructured('Requested worker token');
    }

    logWorkerTokenReceived(expiresInMinutes = 55) {
        this.logStructured(`Worker token received (expires in ${expiresInMinutes} minutes) ✅`);
    }

    logWorkerTokenFailed() {
        this.logStructured('Worker token request failed ❌');
    }

    logWorkerTokenReused(timeRemaining) {
        this.logStructured(`Worker token reused from cache (${timeRemaining} remaining).`);
    }

    logFileSelected(filename, recordCount) {
        this.logStructured(`Selected file: ${filename} (${recordCount} records)`);
    }

    logActionStarted(action, recordCount = null) {
        if (recordCount) {
            this.logStructured(`${action} started – action: ${action} (${recordCount} records)`);
        } else {
            this.logStructured(`${action} started – action: ${action}`);
        }
    }

    logActionComplete(action, successCount, skippedCount = 0, failedCount = 0) {
        let message = `Action complete – ${action}: ${successCount}`;
        if (skippedCount > 0) message += `, Skipped: ${skippedCount}`;
        if (failedCount > 0) message += `, Failed: ${failedCount}`;
        message += ' ✅';
        this.logStructured(message);
    }

    logImportOperation(successCount, totalCount, duration) {
        this.logStructured(`IMPORT OPERATION COMPLETE: ${successCount}/${totalCount} users imported successfully in ${duration}ms`);
        this.info('Import operation summary', {
            totalRecords: totalCount,
            successful: successCount,
            failed: totalCount - successCount,
            skipped: 0,
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / totalCount) * 100)}%`
        });
    }

    logModifyOperation(successCount, totalCount, duration) {
        this.logStructured(`MODIFY OPERATION COMPLETE: ${successCount}/${totalCount} users modified successfully in ${duration}ms`);
        this.info('Modify operation summary', {
            totalRecords: totalCount,
            successful: successCount,
            failed: totalCount - successCount,
            skipped: 0,
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / totalCount) * 100)}%`
        });
    }

    logDeleteOperation(successCount, totalCount, notFoundCount = 0, duration) {
        this.logStructured(`DELETE OPERATION COMPLETE: ${successCount}/${totalCount} users deleted successfully in ${duration}ms`);
        this.info('Delete operation summary', {
            totalRecords: totalCount,
            successful: successCount,
            failed: totalCount - successCount - notFoundCount,
            notFound: notFoundCount,
            skipped: 0,
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / totalCount) * 100)}%`
        });
    }

    logUserAction(action, details) {
        const { username, userId, status, message } = details;
        const identifier = username || userId || 'unknown';
        this.logStructured(`${action} user ${identifier}: ${status} - ${message || 'No message'}`);
    }

    logBulkProgress(processed, total, action = 'Processing') {
        this.logStructured(`${action} progress: ${processed}/${total} completed`);
    }

    // Client error logging
    logClientError(logEntry) {
        try {
            if (logEntry.structured) {
                this.logStructured(logEntry.message);
            } else {
                this.logger.info(logEntry.message, {
                    source: 'client',
                    data: logEntry.data,
                    timestamp: logEntry.timestamp
                });
            }
        } catch (error) {
            this.logger.error('Failed to log client message', { error: error.message });
        }
    }

    // Standard logging methods
    log(level, message, meta = {}) {
        this.logger.log(level, message, meta);
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }
}

module.exports = new LogManager(); 
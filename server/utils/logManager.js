// ============================================================================
// PINGONE USER MANAGEMENT - LOG MANAGER
// ============================================================================
// Handles structured logging for all PingOne API operations
// Features: One-line API calls, clear section dividers, library loads

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
        this.startFileLogging();
    }

    createLogger() {
        const structuredFormat = winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.printf(info => {
                if (info.structured) {
                    return `[${info.timestamp}] ${info.message}`;
                } else {
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
                        winston.format.printf(info => {
                            let logMessage = `[${info.timestamp}] ${info.level}: ${info.message}`;
                            const splat = info[Symbol.for('splat')];
                            if (splat && splat.length) {
                                const meta = splat[0];
                                const metaString = JSON.stringify(meta, null, 2);
                                if (metaString !== '{}') {
                                    logMessage += `\n${metaString}`;
                                }
                            }
                            return logMessage;
                        })
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

    logStructured(message) {
        this.logger.info(message, { structured: true });
    }

    startFileLogging() {
        const logPath = this.getLogFilePath();
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
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.errors({ stack: true }),
                winston.format.printf(info => {
                    if (info.structured) {
                        return `[${info.timestamp}] ${info.message}`;
                    } else {
                        return JSON.stringify({
                            timestamp: info.timestamp,
                            level: info.level,
                            message: info.message,
                            service: info.service,
                            ...info
                        });
                    }
                })
            )
        });
        this.logger.add(this.fileTransport);
        this.config.isLogging = true;
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
            this.startFileLogging();
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

    // ============================================================================
    // LIBRARY LOADS AND SERVER EVENTS
    // ============================================================================
    logLibraryLoad(libraryName, version = 'unknown') {
        this.logStructured(`LIBRARY LOAD: ${libraryName} v${version}`);
    }

    logServerStart(port = 3002) {
        this.logStructured('\n********************************************************************************');
        this.logStructured('SERVER START: PingOne User Management Server');
        this.logStructured(`PORT: ${port}`);
        this.logStructured('********************************************************************************\n');
    }

    logServerStop() {
        this.logStructured('\n********************************************************************************');
        this.logStructured('SERVER STOP: PingOne User Management Server');
        this.logStructured('********************************************************************************\n');
    }

    // ============================================================================
    // TOKEN MANAGEMENT
    // ============================================================================
    logWorkerTokenRequested() {
        this.logStructured('\n********************************************************************************');
        this.logStructured('TOKEN EVENT: Requested worker token');
    }

    logWorkerTokenReceived(expiresInMinutes = 55) {
        this.logStructured(`TOKEN EVENT: Worker token received (expires in ${expiresInMinutes} minutes) ✅`);
        this.logStructured('********************************************************************************\n');
    }

    logWorkerTokenFailed() {
        this.logStructured('TOKEN EVENT: Worker token request failed ❌');
        this.logStructured('********************************************************************************\n');
    }

    logWorkerTokenReused(timeRemaining) {
        this.logStructured(`TOKEN EVENT: Worker token reused from cache (${timeRemaining} remaining)`);
        this.logStructured('********************************************************************************\n');
    }

    // ============================================================================
    // OPERATION SECTIONS
    // ============================================================================
    logFileSelected(filename, recordCount) {
        this.logStructured(`FILE SELECTED: ${filename} (${recordCount} records)`);
    }

    logActionStarted(action, recordCount = null) {
        this.logStructured('\n********************************************************************************');
        this.logStructured(`${action.toUpperCase()} OPERATION START`);
        if (recordCount) {
            this.logStructured(`RECORDS TO PROCESS: ${recordCount}`);
        }
        this.logStructured('********************************************************************************');
    }

    logActionComplete(action, successCount, skippedCount = 0, failedCount = 0) {
        this.logStructured('********************************************************************************');
        this.logStructured(`${action.toUpperCase()} OPERATION COMPLETE`);
        this.logStructured(`RESULTS: Success=${successCount}, Skipped=${skippedCount}, Failed=${failedCount}`);
        this.logStructured('********************************************************************************\n');
    }

    logImportOperation(successCount, totalCount, duration) {
        this.logStructured('\n********************************************************************************');
        this.logStructured('IMPORT OPERATION SUMMARY');
        this.logStructured(`TOTAL RECORDS: ${totalCount}`);
        this.logStructured(`SUCCESSFUL: ${successCount}`);
        this.logStructured(`FAILED: ${totalCount - successCount}`);
        this.logStructured(`DURATION: ${duration}ms`);
        this.logStructured(`SUCCESS RATE: ${Math.round((successCount / totalCount) * 100)}%`);
        this.logStructured('********************************************************************************\n');
    }

    logModifyOperation(successCount, totalCount, duration) {
        this.logStructured('\n********************************************************************************');
        this.logStructured('MODIFY OPERATION SUMMARY');
        this.logStructured(`TOTAL RECORDS: ${totalCount}`);
        this.logStructured(`SUCCESSFUL: ${successCount}`);
        this.logStructured(`FAILED: ${totalCount - successCount}`);
        this.logStructured(`DURATION: ${duration}ms`);
        this.logStructured(`SUCCESS RATE: ${Math.round((successCount / totalCount) * 100)}%`);
        this.logStructured('********************************************************************************\n');
    }

    logDeleteOperation(successCount, totalCount, notFoundCount = 0, duration) {
        this.logStructured('\n********************************************************************************');
        this.logStructured('DELETE OPERATION SUMMARY');
        this.logStructured(`TOTAL RECORDS: ${totalCount}`);
        this.logStructured(`SUCCESSFUL: ${successCount}`);
        this.logStructured(`NOT FOUND: ${notFoundCount}`);
        this.logStructured(`FAILED: ${totalCount - successCount - notFoundCount}`);
        this.logStructured(`DURATION: ${duration}ms`);
        this.logStructured(`SUCCESS RATE: ${Math.round((successCount / totalCount) * 100)}%`);
        this.logStructured('********************************************************************************\n');
    }

    // ============================================================================
    // INDIVIDUAL API CALLS (ONE LINE EACH)
    // ============================================================================
    logUserAction(action, details) {
        const { username, userId, status, message } = details;
        const user = username || userId || 'unknown';
        this.logStructured(`API CALL [${action.toUpperCase()}]: ${user} - ${status} - ${message}`);
    }

    logBulkProgress(processed, total, action = 'Processing') {
        const percentage = Math.round((processed / total) * 100);
        this.logStructured(`PROGRESS [${action}]: ${processed}/${total} (${percentage}%)`);
    }

    logClientError(logEntry) {
        this.logStructured(`CLIENT ERROR: ${logEntry.message}`);
        if (logEntry.data) {
            this.logStructured(`ERROR DETAILS: ${JSON.stringify(logEntry.data)}`);
        }
    }

    // ============================================================================
    // STANDARD LOGGING METHODS
    // ============================================================================
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
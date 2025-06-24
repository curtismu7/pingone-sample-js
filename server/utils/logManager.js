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
        
        // Load saved configuration if it exists
        this.loadConfig();
        
        // Start file logging if enabled
        if (this.config.isLogging) {
            this.startFileLogging();
        }
    }

    createLogger() {
        const structuredFormat = winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.printf(info => {
                if (info.structured) {
                    return `[${info.timestamp}] ${info.message}`;
                } else {
                    // Format regular logs as clean text
                    const { timestamp, level, message, service, ...rest } = info;
                    const meta = Object.entries(rest)
                        .filter(([key]) => !['timestamp', 'level', 'message', 'service'].includes(key))
                        .map(([key, value]) => {
                            if (value === null || value === undefined) return '';
                            if (typeof value === 'object') {
                                return `${key}: ${JSON.stringify(value).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()}`;
                            }
                            return `${key}: ${value}`;
                        })
                        .filter(Boolean)
                        .join(' | ');
                    
                    return `[${timestamp}] ${level.toUpperCase()}: ${message}${meta ? ' | ' + meta : ''}`;
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

    logStructured(message, type = 'info') {
        // Add transaction separators for better readability
        if (message.startsWith('===')) {
            const separator = '\n' + '*'.repeat(80) + '\n';
            this.logger.info(separator + message, { structured: true });
        } else if (message.includes('[started ]')) {
            this.logger.info('\n' + '*'.repeat(40) + ' NEW TRANSACTION ' + '*'.repeat(40), { structured: true });
            this.logger.info(message, { structured: true });
        } else if (message.includes('[success]') || message.includes('[error  ]')) {
            this.logger.info(message, { structured: true });
            this.logger.info('*'.repeat(80), { structured: true });
        } else if (message.includes('Import operation completed') || message.includes('Sending import response')) {
            // Create a box around import completion messages
            const lines = message.split('\n');
            const maxLength = Math.max(...lines.map(line => line.length));
            const border = '╔' + '═'.repeat(maxLength + 2) + '╗';
            const emptyLine = '║ ' + ' '.repeat(maxLength) + ' ║';
            
            let boxedMessage = `\n${border}\n`;
            boxedMessage += emptyLine + '\n';
            
            for (const line of lines) {
                const padding = ' '.repeat(maxLength - line.length);
                boxedMessage += `║ ${line}${padding} ║\n`;
            }
            
            boxedMessage += `${emptyLine}\n`;
            boxedMessage += '╚' + '═'.repeat(maxLength + 2) + '╝\n';
            
            this.logger.info(boxedMessage, { structured: true });
        } else {
            this.logger[type](message, { structured: true });
        }
    }

    startFileLogging() {
        try {
            if (this.fileTransport) {
                this.stopFileLogging();
            }
            
            const logPath = this.getLogFilePath();
            this.fileTransport = new winston.transports.File({
                filename: logPath,
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                    winston.format.json()
                )
            });
            
            this.logger.add(this.fileTransport);
            this.config.isLogging = true;
            this.saveConfig();
            this.logger.info('File logging started', { logFile: logPath });
        } catch (error) {
            this.logger.error('Failed to start file logging', { error: error.message });
            throw error;
        }
    }

    async stopFileLogging() {
        try {
            if (this.fileTransport) {
                // Ensure all logs are flushed before removing the transport
                await new Promise(resolve => {
                    this.fileTransport.on('finish', resolve);
                    this.logger.remove(this.fileTransport);
                    // Force close the stream
                    if (this.fileTransport._stream && !this.fileTransport._stream.closed) {
                        this.fileTransport._stream.end();
                    }
                    this.fileTransport = null;
                });
                
                this.config.isLogging = false;
                this.saveConfig();
                this.logger.info('File logging stopped');
            }
            return true;
        } catch (error) {
            console.error('Failed to stop file logging:', error);
            this.logger.error('Failed to stop file logging', { error: error.message });
            throw error;
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Save config to file
        this.saveConfig();
        
        // Restart file logging if log file changed or logging was toggled
        if (newConfig.logFile || newConfig.isLogging !== undefined) {
            this.stopFileLogging();
            if (this.config.isLogging) {
                this.startFileLogging();
            }
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
        try {
            const logPath = this.getLogFilePath();
            if (!fs.existsSync(logPath)) {
                return '';
            }
            return fs.readFileSync(logPath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read log file: ${error.message}`);
        }
    }

    saveConfig() {
        try {
            const configPath = path.join(this.logDirectory, 'logging-config.json');
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            this.logger.error('Failed to save logging config', { error: error.message });
        }
    }
    
    loadConfig() {
        try {
            const configPath = path.join(this.logDirectory, 'logging-config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                this.config = { ...this.config, ...JSON.parse(configData) };
            }
        } catch (error) {
            this.logger.error('Failed to load logging config', { error: error.message });
        }
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
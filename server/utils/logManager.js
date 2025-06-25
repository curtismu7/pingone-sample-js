const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { promisify } = require('util');
const writeFile = promisify(fsSync.writeFile);
const readFile = promisify(fsSync.readFile);
const exists = promisify(fsSync.exists);
const mkdir = promisify(fsSync.mkdir);

class LogManager {
    constructor() {
        this.logDirectory = path.join(__dirname, '../../logs');
        this.stateFile = path.join(this.logDirectory, 'logging-state.json');
        this.config = {
            isLogging: false, // Default to false, will be loaded from state
            logFile: path.join(this.logDirectory, 'import-status.log'),
            maxLogEntries: 1000
        };
        this.logs = [];
        this.fileTransport = null;
        
        // Ensure log directory exists and is writable
        if (!this.ensureLogDirectory()) {
            console.error('Failed to initialize log directory. Logging to console only.');
            return;
        }
        
        // Load previous state if it exists
        this.loadState().then(() => {
            this.logger = this.createLogger();
            console.log(`Logging to: ${this.config.logFile}`);
            
            // If logging was active, restart it
            if (this.config.isLogging) {
                this.startFileLogging();
            }
        }).catch(err => {
            console.error('Failed to load logging state:', err);
            // Always initialize a console logger as fallback
            this.logger = winston.createLogger({
                level: process.env.LOG_LEVEL || 'info',
                transports: [new winston.transports.Console()],
                exitOnError: false
            });
        });
    }
    
    /**
     * Load logging state from file
     */
    async loadState() {
        try {
            if (await exists(this.stateFile)) {
                const data = await readFile(this.stateFile, 'utf8');
                const state = JSON.parse(data);
                this.config.isLogging = !!state.isLogging;
                console.log('Loaded logging state:', this.config.isLogging ? 'active' : 'inactive');
            } else {
                console.log('No previous logging state found, using default state');
            }
        } catch (error) {
            console.error('Error loading logging state:', error);
            this.config.isLogging = false;
        }
    }
    
    /**
     * Save current logging state to file
     */
    async saveState() {
        try {
            const state = {
                isLogging: this.config.isLogging,
                timestamp: new Date().toISOString()
            };
            await writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving logging state:', error);
        }
    }

    ensureLogDirectory() {
        try {
            if (!fsSync.existsSync(this.logDirectory)) {
                fsSync.mkdirSync(this.logDirectory, { 
                    recursive: true,
                    mode: 0o755 // Ensure proper permissions
                });
            }
            // Verify directory is writable
            fsSync.accessSync(this.logDirectory, fsSync.constants.W_OK);
            return true;
        } catch (error) {
            console.error(`Failed to initialize log directory: ${error.message}`);
            // Fall back to a temporary directory if the default one fails
            this.logDirectory = path.join(require('os').tmpdir(), 'pingone-logs');
            try {
                if (!fsSync.existsSync(this.logDirectory)) {
                    fsSync.mkdirSync(this.logDirectory, { recursive: true });
                }
                return true;
            } catch (fallbackError) {
                console.error(`Failed to initialize fallback log directory: ${fallbackError.message}`);
                return false;
            }
        }
    }

    /**
     * Start file logging by adding a file transport to the logger
     */
    async startFileLogging() {
        try {
            // If file transport already exists, remove it first
            if (this.fileTransport) {
                this.logger.remove(this.fileTransport);
            }

            // Create a new file transport with human-readable format
            this.fileTransport = new winston.transports.File({
                filename: this.config.logFile,
                level: 'info',
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        // Convert meta to string if it exists
                        const metaString = Object.keys(meta).length 
                            ? ` ${JSON.stringify(meta, null, 2)}` 
                            : '';
                        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaString}`;
                    })
                ),
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                tailable: true,
                handleExceptions: true,
                json: false // Disable JSON formatting for better readability
            });

            // Add the file transport to the logger
            this.logger.add(this.fileTransport);
            this.config.isLogging = true;
            
            // Save the state
            await this.saveState();
            console.log(`File logging started: ${this.config.logFile}`);
            
            // Add a test message to the log file
            this.logger.info('*** Logging Started ****\n');
            return true;
        } catch (error) {
            console.error('Failed to start file logging:', error);
            this.config.isLogging = false;
            return false;
        }
    }

    /**
     * Stop file logging by removing the file transport from the logger
     */
    async stopFileLogging() {
        try {
            if (this.fileTransport) {
                this.logger.remove(this.fileTransport);
                this.fileTransport = null;
            }
            this.config.isLogging = false;
            
            // Save the state
            await this.saveState();
            console.log('File logging stopped');
            return true;
        } catch (error) {
            console.error('Failed to stop file logging:', error);
            return false;
        }
    }

    createLogger() {
        // Create a format for console output
        const consoleFormat = winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(info => {
                const { timestamp, level, message, ...meta } = info;
                let logMessage = `[${timestamp}] ${level}: ${message}`;
                if (Object.keys(meta).length > 0) {
                    logMessage += ' ' + JSON.stringify(meta, null, 2);
                }
                return logMessage;
            })
        );

        // Create a format for file output
        const fileFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        );

        // Configure transports
        const transports = [
            new winston.transports.Console({
                format: consoleFormat,
                handleExceptions: true
            })
        ];

        // Add file transport if logging is enabled
        if (this.config.isLogging) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.logDirectory, this.config.logFile),
                    format: fileFormat,
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                    tailable: true
                })
            );
        }

        // Create the logger
        const logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.errors({ stack: true }),
            defaultMeta: { service: 'user-service' },
            transports: transports,
            exitOnError: false
        });

        // Add development logging
        if (process.env.NODE_ENV === 'development') {
            logger.on('data', (info) => {
                const logMethod = console[info.level] || console.log;
                logMethod(`[${info.timestamp}] ${info.level.toUpperCase()}:`, info.message, info);
            });
        }

        return logger;
    }

    // Basic logging methods
    error(message, meta) {
        if (this.logger && typeof this.logger.error === 'function') {
            this.logger.error(message, meta);
        } else {
            console.error('Logger not initialized:', message, meta);
        }
    }

    warn(message, meta) {
        if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn(message, meta);
        } else {
            console.warn('Logger not initialized:', message, meta);
        }
    }

    info(message, meta) {
        if (this.logger && typeof this.logger.info === 'function') {
            this.logger.info(message, meta);
        } else {
            console.info('Logger not initialized:', message, meta);
        }
    }

    debug(message, meta) {
        if (this.logger && typeof this.logger.debug === 'function') {
            this.logger.debug(message, meta);
        } else {
            console.debug('Logger not initialized:', message, meta);
        }
    }

    // Structured logging for specific events
    logStructured(message) {
        if (message === null || message === undefined) {
            this.warn('logStructured called with null or undefined message');
            return;
        }
        
        try {
            const messageStr = String(message);
            if (messageStr.startsWith('===')) {
                const separator = '\n' + '*'.repeat(80) + '\n';
                this.info(separator + messageStr);
            } else {
                this.info(messageStr);
            }
        } catch (error) {
            console.error('Error in logStructured:', error);
            this.error('Error in logStructured:', { error: error.message });
        }
    }

    // Log server startup
    logServerStart(port) {
        this.info('=== Server Starting ===');
        this.info(`Server is running on port ${port}`, {
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
            platform: process.platform,
            memory: {
                rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
                heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
            }
        });
    }

    // Audit logging for security-related events
    audit(action, details = {}) {
        this.info('AUDIT:', {
            action,
            timestamp: new Date().toISOString(),
            ...details
        });
    }
}

// Create a singleton instance
const logManager = new LogManager();

// Log uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    logManager.error('Uncaught Exception:', { 
        error: error.message, 
        stack: error.stack 
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logManager.error('Unhandled Rejection at:', { 
        promise, 
        reason: reason instanceof Error ? reason.message : reason 
    });
    process.exit(1);
});

module.exports = logManager;

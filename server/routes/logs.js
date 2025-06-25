/* eslint-disable no-console */
'use strict';

// Required dependencies
const express = require('express');
const router = express.Router();
const logManager = require('../utils/logManager');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { sanitize } = require('mongo-sanitize');
const { escape } = require('html-escaper');

// Constants
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB max log file size
const LOG_RETENTION_DAYS = 7; // Keep logs for 7 days
const MAX_LOG_ENTRIES = 10000; // Maximum number of log entries to keep in memory
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const REQUEST_TIMEOUT = 10000; // 10 seconds timeout for file operations
const logsDir = path.join(__dirname, '../logs');

/**
 * Async handler wrapper to catch async/await errors in route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Rate limiting middleware for log endpoints
 * Limits each IP to 500 requests per minute in production, unlimited in development
 */
// Create a custom rate limit store to handle logging when limit is reached
class CustomRateLimitStore {
    constructor(windowMs) {
        this.windowMs = windowMs;
        this.hits = new Map();
    }

    async increment(key) {
        const now = Date.now();
        let hit = this.hits.get(key) || { count: 0, resetTime: now + this.windowMs };

        // Reset counts if window has passed
        if (now > hit.resetTime) {
            hit = { count: 0, resetTime: now + this.windowMs };
        }

        hit.count++;
        this.hits.set(key, hit);

        // Clean up old entries periodically
        if (Math.random() < 0.001) {
            this.cleanup();
        }

        return {
            totalHits: hit.count,
            resetTime: hit.resetTime,
        };
    }

    cleanup() {
        const now = Date.now();
        for (const [key, hit] of this.hits.entries()) {
            if (now > hit.resetTime + this.windowMs) {
                this.hits.delete(key);
            }
        }
    }
}

const logsLimiter = rateLimit({
    windowMs: process.env.NODE_ENV === 'production' ? 60 * 1000 : 1000, // 1 second in development, 1 minute in production
    max: process.env.NODE_ENV === 'production' ? 500 : 1000, // More generous limits in development
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        logManager.warn('API rate limit reached', { 
            ip, 
            path: req.path,
            method: req.method,
            userAgent
        });
        
        res.status(options.statusCode).json({
            success: false,
            error: 'Too many requests, please try again later',
            retryAfter: Math.ceil(options.windowMs / 1000) + ' seconds',
            limit: options.max,
            current: req.rateLimit?.current || 0,
            remaining: req.rateLimit?.remaining || 0,
            resetTime: req.rateLimit?.resetTime || 0
        });
    },
    skipFailedRequests: true,
    keyGenerator: (req) => {
        // Use a combination of IP and user agent for better rate limiting
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'unknown';
        return `${ip}-${userAgent}`;
    }
});

/**
 * Sanitize input strings in request body
 * Trims whitespace from all string values in the request body
 */
const sanitizeInput = (req, res, next) => {
    if (req.body) {
        req.body = Object.entries(req.body).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'string' ? value.trim() : value;
            return acc;
        }, {});
    }
    next();
};

/**
 * Sanitize request body to prevent NoSQL injection
 * Uses mongo-sanitize to remove potentially malicious input
 */
const sanitizeBody = (req, res, next) => {
    if (req.body) {
        req.sanitizedBody = sanitize(req.body);
    }
    next();
};

/**
 * Validate pagination parameters from query string
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const validatePagination = (req, res, next) => {
    try {
        const { limit = DEFAULT_PAGE_SIZE, page = 1 } = req.query;
        const parsedLimit = Math.min(parseInt(limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);

        if (parsedLimit < 1 || parsedLimit > MAX_PAGE_SIZE) {
            return res.status(400).json({
                success: false,
                error: `Invalid limit. Must be between 1 and ${MAX_PAGE_SIZE}`,
            });
        }

        req.pagination = {
            limit: parsedLimit,
            page: parsedPage,
            skip: (parsedPage - 1) * parsedLimit,
        };
        next();
    } catch (error) {
        logManager.error('Pagination validation error', { error: error.message });
        res.status(400).json({
            success: false,
            error: 'Invalid pagination parameters',
        });
    }
};

/**
 * Validate and normalize log level filter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const validateLogLevel = (req, res, next) => {
    try {
        const { level = 'all' } = req.query;
        const validLevels = ['all', 'error', 'warn', 'info', 'debug'];
        const normalizedLevel = level.toLowerCase();

        if (!validLevels.includes(normalizedLevel)) {
            return res.status(400).json({
                success: false,
                error: `Invalid log level. Must be one of: ${validLevels.join(', ')}`,
            });
        }

        req.logLevel = normalizedLevel;
        next();
    } catch (error) {
        logManager.error('Log level validation error', { error: error.message });
        res.status(400).json({
            success: false,
            error: 'Invalid log level parameter',
        });
    }
};

/**
 * Validation rules and middleware for client log entries
 */
// Validation middleware for client log entries
const validateClientLog = [
    // Sanitize input first
    (req, res, next) => {
        // Sanitize body
        if (req.body) {
            req.sanitizedBody = sanitize(req.body);
        }
        next();
    },
    
    // Validate fields using express-validator
    body('level')
        .optional()
        .isIn(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
        .withMessage('Invalid log level'),
        
    body('message')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Log message must be between 1 and 1000 characters'),
        
    body('data')
        .optional()
        .isObject()
        .withMessage('Log data must be an object'),
    
    body('timestamp')
        .optional()
        .isISO8601()
        .withMessage('Invalid timestamp format. Use ISO 8601 format'),
    
    // Custom validation middleware
    (req, res, next) => {
        // Set default level if not provided
        if (!req.body.level) {
            req.body.level = 'info';
        }
        
        // Truncate long messages
        if (req.body.message && req.body.message.length > 1000) {
            req.body.message = req.body.message.substring(0, 1000) + '...';
        }
        
        // Limit data size
        if (req.body.data && JSON.stringify(req.body.data).length > 5000) {
            req.body.data = { 
                _warning: 'Data truncated - too large',
                originalType: typeof req.body.data === 'object' ? 'object' : typeof req.body.data,
                keys: Object.keys(req.body.data).slice(0, 10) // Show first 10 keys
            };
        }
        
        // Validate the request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array().map(err => ({
                    param: err.param,
                    msg: err.msg,
                    value: err.value
                }))
            });
        }
        
        next();
    }
];

/**
 * Get current logging status and configuration
 * @route GET /logs/status
 * @returns {Object} Logging configuration
 */
router.get(
    '/status',
    logsLimiter,
    asyncHandler(async (req, res) => {
        try {
            // Get current log file path
            const logFile = logManager.config.logFile;
            if (!logFile) {
                return res.status(400).json({
                    success: false,
                    error: 'No log file configured',
                });
            }

            // Get file stats if exists
            let stats;
            try {
                stats = await fsp.stat(logFile);
            } catch (error) {
                // Log file might not exist yet, which is okay
                stats = null;
            }

            const config = {
                isLogging: logManager.config.isLogging,
                logFile,
                logLevel: logManager.config.level || 'info',
                maxSize: MAX_LOG_SIZE,
                retentionDays: LOG_RETENTION_DAYS,
                lastUpdated: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                logDirectory: path.dirname(logFile),
                stats: stats
                    ? {
                          size: stats.size,
                          created: stats.birthtime.toISOString(),
                          modified: stats.mtime.toISOString(),
                      }
                    : null,
            };

            res.json({
                success: true,
                data: config,
            });
        } catch (error) {
            logManager.error('Failed to get logging status', {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get logging status',
                timestamp: new Date().toISOString(),
            });
        }
    })
);

/**
 * Start file logging
 * @route POST /logs/start
 * @returns {Object} Logging status
 */
router.post(
    '/start',
    logsLimiter,
    asyncHandler(async (req, res) => {
        try {
            // Validate log file exists and is writable
            const logFile = logManager.config.logFile;
            if (!logFile) {
                return res.status(400).json({
                    success: false,
                    error: 'Log file path not configured',
                });
            }

            try {
                await fsp.access(logFile, fs.constants.W_OK);
            } catch (error) {
                // If file doesn't exist, try to create it with the directory
                await fsp.mkdir(path.dirname(logFile), { recursive: true });
                await fsp.writeFile(logFile, '');
            }

            // Start file logging
            const started = await logManager.startFileLogging();
            if (!started) {
                throw new Error('Failed to start file logging');
            }

            res.json({
                success: true,
                message: 'File logging started successfully',
                logFile,
                isLogging: true,
            });
        } catch (error) {
            logManager.error('Failed to start file logging', {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to start file logging',
                timestamp: new Date().toISOString(),
            });
        }
    })
);

/**
 * Stop file logging
 * @route POST /logs/stop
 * @returns {Object} Logging status
 */
router.post(
    '/stop',
    logsLimiter,
    asyncHandler(async (req, res) => {
        try {
            // If logging isn't running, return success since the desired state is already achieved
            if (!logManager.config.isLogging) {
                return res.json({
                    success: true,
                    message: 'Logging was already stopped',
                    isLogging: false,
                    timestamp: new Date().toISOString(),
                    alreadyStopped: true
                });
            }

            const stopped = await logManager.stopFileLogging();
            if (!stopped) {
                throw new Error('Failed to stop file logging');
            }

            res.json({
                success: true,
                message: 'File logging stopped',
                isLogging: false,
                timestamp: new Date().toISOString(),
                alreadyStopped: false
            });
        } catch (error) {
            logManager.error('Failed to stop file logging', {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to stop file logging',
                timestamp: new Date().toISOString(),
            });
        }
    })
);

/**
 * Get paginated logs with filtering options
 * @route GET /logs
 * @param {number} [limit=100] - Number of log entries per page (pagination)
 * @param {number} [page=1] - Page number (pagination)
 * @param {string} [level=all] - Log level filter (error, warn, info, debug, all)
 * @returns {Object} Paginated log entries with metadata
 */
router.get('/', logsLimiter, validatePagination, validateLogLevel, asyncHandler(async (req, res) => {
    try {
        const { limit, page } = req.pagination;
        const logFile = path.join(__dirname, '../logs/combined.log');
        const level = req.logLevel;
        
        // Validate log file exists
        await fs.access(logFile).catch(() => {
            logManager.warn('Log file not found', { file: logFile });
            return res.json({ 
                success: true, 
                data: [], 
                pagination: { 
                    total: 0, 
                    page, 
                    limit, 
                    totalPages: 0 
                },
                metadata: {
                    logFile,
                    fileSize: 0,
                    lastModified: null
                }
            });
        });

        // Get file stats
        const stats = await fsp.stat(logFile);
        
        // Read and process logs
        let logs = [];
        try {
            const fileContent = await fs.readFile(logFile, 'utf8');
            logs = fileContent.split('\n').filter(Boolean);
            
            // Filter logs by level if specified
            if (level !== 'all') {
                logs = logs.filter(log => log.startsWith(`[${level}]`));
            }
            
            // Paginate logs
            const total = logs.length;
            const paginatedLogs = logs.slice((page - 1) * limit, page * limit);
            
            res.json({
                success: true,
                data: paginatedLogs,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
                metadata: {
                    logFile,
                    fileSize: stats.size,
                    lastModified: stats.mtime.toISOString(),
                },
            });
        } catch (error) {
            logManager.error('Failed to retrieve logs', {
                error: error.message,
                stack: error.stack,
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to retrieve logs',
                timestamp: new Date().toISOString(),
            });
        }
    } catch (error) {
        logManager.error('Failed to retrieve logs', {
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to retrieve logs',
            timestamp: new Date().toISOString(),
        });
    }
}));

/**
 * Log a new entry
 * @route POST /logs
 * @param {string} level - Log level (error, warn, info, debug)
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @returns {Object} Operation status
 */
router.post(
    '/',
    logsLimiter,
    validateClientLog,
    asyncHandler(async (req, res) => {
        // Set a timeout for the operation
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                res.status(504).json({
                    success: false,
                    error: 'Logging operation timed out'
                });
            }
        }, 5000); // 5 second timeout

        try {
            const { level = 'info', message, data = {} } = req.body;
            
            // Validate message is present and a string
            if (typeof message !== 'string' || message.trim() === '') {
                throw new Error('Message is required and must be a non-empty string');
            }
            
            // Get client info (safely)
            const clientInfo = {
                ip: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                referrer: req.headers['referer'] || 'none',
                method: req.method,
                path: req.path
            };
            
            // Prepare log data with size limits
            const logData = {
                ...(data || {}),
                client: clientInfo,
                timestamp: req.body.timestamp || new Date().toISOString()
            };
            
            // Log the message
            logManager.log(message, level, logData);
            
            // Clear the timeout
            clearTimeout(timeout);
            
            // Send minimal success response
            res.json({ 
                success: true,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            // Clear the timeout
            clearTimeout(timeout);
            
            // Log the error with more context
            console.error('Error logging message:', {
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                body: req.body
            });
            
            // Send appropriate error response
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({
                success: false,
                error: statusCode >= 500 ? 'Internal server error' : error.message,
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

/**
 * Clear the log file
 * @route DELETE /logs
 * @returns {Object} Status of the operation
 */
router.post('/clear', logsLimiter, asyncHandler(async (req, res) => {
    try {
        const logFile = logManager.config.logFile || path.join(__dirname, '../logs/combined.log');
        
        // Check if log file exists
        try {
            await fs.access(logFile);
        } catch (error) {
            logManager.warn('Log file does not exist, nothing to clear', { logFile });
            return res.status(200).json({
                success: true,
                message: 'No log file exists to clear'
            });
        }
        
        // Clear the log file by writing an empty string
        await fs.writeFile(logFile, '');
        
        logManager.info('Logs cleared successfully');
        
        res.status(200).json({
            success: true,
            message: 'Logs cleared successfully'
        });
        
    } catch (error) {
        const errorMessage = 'Error clearing logs';
        logManager.error(errorMessage, { error: error.message, stack: error.stack });
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}));

/**
 * @swagger
 * /api/logs/export:
 *   get:
 *     tags: [Logs]
 *     summary: Export logs
 *     description: Export logs as a downloadable file
 *     responses:
 *       200:
 *         description: Log file downloaded successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Log file not found
 *       500:
 *         description: Error exporting logs
 */
router.get('/export', logsLimiter, asyncHandler(async (req, res) => {
    let logFile;
    
    try {
        // Determine the log file path
        logFile = logManager.config.logFile || path.join(__dirname, '../logs/combined.log');
        
        // Normalize the path to handle any relative paths
        logFile = path.normalize(logFile);
        
        logManager.info('Attempting to export log file', { logFile });
        
        // Check if log file exists and is accessible
        try {
            await fsp.access(logFile, fs.constants.R_OK);
        } catch (error) {
            logManager.warn('Log file not found or not accessible', { 
                file: logFile, 
                error: error.message,
                code: error.code
            });
            
            return res.status(404).json({
                success: false,
                error: 'Log file not found or not accessible',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }

        // Get file stats
        let stats;
        try {
            stats = await fsp.stat(logFile);
            
            // Check if file is empty
            if (stats.size === 0) {
                logManager.warn('Log file is empty', { file: logFile });
                return res.status(200)
                    .set('Content-Type', 'text/plain')
                    .set('Content-Disposition', `attachment; filename=empty-logs-${new Date().toISOString().split('T')[0]}.log`)
                    .send('No log entries found. The log file is empty.');
            }
            
        } catch (error) {
            logManager.error('Error getting file stats', {
                file: logFile,
                error: error.message,
                stack: error.stack
            });
            throw new Error('Could not read log file information');
        }

        // Set headers for file download
        const filename = `logs-${new Date().toISOString().split('T')[0]}.log`;
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        
        logManager.debug('Streaming log file to client', { 
            file: logFile, 
            size: stats.size,
            filename
        });
        
        // Stream the file to the response with error handling
        const fileStream = fs.createReadStream(logFile, { encoding: 'utf8' });
        
        // Handle stream errors
        fileStream.on('error', (error) => {
            logManager.error('Error reading log file', {
                file: logFile,
                error: error.message,
                code: error.code,
                stack: error.stack
            });
            
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Error reading log file',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                    timestamp: new Date().toISOString()
                });
            } else {
                // If headers are already sent, we can't send JSON, so end the response
                res.end('\n\nError: Failed to read log file');
            }
            
            // Destroy the stream to prevent memory leaks
            fileStream.destroy();
        });
        
        // Handle client disconnect
        req.on('close', () => {
            if (!res.headersSent) {
                logManager.warn('Client disconnected before receiving log file', { file: logFile });
                fileStream.destroy();
            }
        });
        
        // Pipe the file to the response
        fileStream.pipe(res);
        
    } catch (error) {
        logManager.error('Failed to export logs', {
            file: logFile,
            error: error.message,
            stack: error.stack,
            code: error.code
        });
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Failed to export logs',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }
}));

/**
 * Delete all logs
 * @route DELETE /logs
 * @returns {Object} Status of the operation
 */
/**
 * Update log file name and location
 * PUT /api/logs/update-filename
 * Body: { 
 *   "fileName": "new-filename.log",
 *   "directory": "/path/to/directory" (optional)
 * }
 */
router.put(
    '/update-filename',
    logsLimiter,
    [
        body('fileName')
            .trim()
            .notEmpty().withMessage('File name is required')
            .matches(/^[\w\-. ]+$/).withMessage('File name contains invalid characters')
            .isLength({ max: 255 }).withMessage('File name is too long'),
        body('directory')
            .optional({ checkFalsy: true })
            .isString().withMessage('Directory must be a string')
            .customSanitizer(value => value.trim())
    ],
    asyncHandler(async (req, res) => {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { fileName, directory } = req.body;
        
        // Determine the target directory
        let targetDir = directory || path.join(__dirname, '../logs');
        
        // Ensure the target directory exists and is accessible
        try {
            await fsp.mkdir(targetDir, { recursive: true });
        } catch (error) {
            console.error('Error creating directory:', error);
            return res.status(400).json({
                success: false,
                error: 'Failed to create or access the specified directory',
                details: error.message
            });
        }
        
        const newLogPath = path.join(targetDir, fileName);

        try {
            // Ensure logs directory exists
            await fsp.mkdir(logsDir, { recursive: true });

            // Check if the new file name is the same as current
            const currentLogPath = logManager.config.logFile;
            if (currentLogPath === newLogPath) {
                return res.status(200).json({
                    success: true,
                    message: 'Log file name is already set to this value',
                    fileName
                });
            }

            // Normalize paths for comparison (resolve relative paths and normalize slashes)
            const normalizedNewPath = path.normalize(path.resolve(newLogPath));
            const normalizedCurrentPath = currentLogPath ? path.normalize(path.resolve(currentLogPath)) : null;

            // Check if the file already exists
            try {
                await fsp.access(newLogPath);
                
                // If the new path is the same as current path, just return success
                if (normalizedCurrentPath && normalizedNewPath === normalizedCurrentPath) {
                    return res.status(200).json({
                        success: true,
                        message: 'Log file name is already set to this value',
                        fileName: path.basename(newLogPath),
                        filePath: newLogPath,
                        noChange: true
                    });
                }
                
                // If it's a different file, return an error
                return res.status(400).json({
                    success: false,
                    error: 'A file with this name already exists',
                    details: {
                        requestedPath: newLogPath,
                        normalizedRequestedPath: normalizedNewPath,
                        currentPath: currentLogPath,
                        normalizedCurrentPath: normalizedCurrentPath
                    }
                });
            } catch (error) {
                // File doesn't exist, which is what we want
                if (error.code !== 'ENOENT') {
                    console.error('Error accessing log file:', error);
                    throw error;
                }
            }

            // If there's an existing log file, rename it
            if (currentLogPath) {
                try {
                    await fsp.access(currentLogPath);
                    await fsp.rename(currentLogPath, newLogPath);
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                    // If the file doesn't exist, just continue and create a new one
                }
            }

            // Store the current logging state
            const wasLogging = logManager.config.isLogging;
            
            // Stop logging if it's currently active
            if (wasLogging) {
                await logManager.stopFileLogging();
            }
            
            // Update the log manager configuration with the full path
            logManager.config.logFile = newLogPath;
            
            // Recreate the logger with the new configuration
            logManager.logger = logManager.createLogger();
            
            // Restart logging if it was active
            if (wasLogging) {
                await logManager.startFileLogging();
            }

            return res.status(200).json({
                success: true,
                message: 'Log file name updated successfully',
                fileName,
                filePath: newLogPath,
                loggingRestarted: wasLogging
            });

        } catch (error) {
            logManager.error('Failed to update log file name', {
                error: error.message,
                stack: error.stack,
                fileName,
                originalError: error
            });

            return res.status(500).json({
                success: false,
                error: 'Failed to update log file name',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    })
);

// Delete log file
router.delete('/', logsLimiter, asyncHandler(async (req, res) => {
    try {
        const logFile = logManager.config.logFile || path.join(__dirname, '../logs/import-status.log');
        const logDir = path.dirname(logFile);
        
        // Ensure log directory exists
        try {
            await fsp.mkdir(logDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw new Error(`Failed to create log directory: ${error.message}`);
            }
        }

        // Create the log file if it doesn't exist
        try {
            await fsp.access(logFile);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fsp.writeFile(logFile, '');
            } else {
                throw error;
            }
        }

        // Clear the log file
        await fsp.writeFile(logFile, '');

        res.status(200).json({
            success: true,
            message: 'Log file cleared successfully',
            logFile,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logManager.error('Failed to clear log file', {
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to clear log file',
            timestamp: new Date().toISOString(),
        });
    }
}));

module.exports = router;
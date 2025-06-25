const winston = require('winston');
const path = require('path');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json, errors } = format;
const DailyRotateFile = require('winston-daily-rotate-file');
const fs = require('fs');

// Ensure logs directory exists
const logDirectory = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add stack trace if available
    if (stack) {
        log += `\n${stack}`;
    }
    
    // Add additional metadata if present
    const metaString = Object.keys(meta).length > 0 
        ? `\n${JSON.stringify(meta, null, 2)}`
        : '';
    
    return `${log}${metaString}`;
});

// Custom format for file output
const fileFormat = combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
);

// Create logger instance
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fileFormat,
    defaultMeta: { service: 'pingone-sample-app' },
    transports: [
        // Console transport for development
        new transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'HH:mm:ss' }),
                consoleFormat
            ),
            level: 'debug', // More verbose in development
            handleExceptions: true,
            handleRejections: true
        }),
        // File transport for all logs
        new DailyRotateFile({
            filename: path.join(logDirectory, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d', // Keep logs for 14 days
            level: 'info',
            format: fileFormat
        }),
        // Error logs in separate file
        new DailyRotateFile({
            filename: path.join(logDirectory, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d', // Keep error logs for 30 days
            level: 'error',
            format: fileFormat
        })
    ],
    exceptionHandlers: [
        new transports.File({ 
            filename: path.join(logDirectory, 'exceptions.log'),
            format: fileFormat
        })
    ],
    exitOnError: false // Don't exit on handled exceptions
});

// Create a stream for morgan (HTTP request logging)
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

// Add a method to log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
    // Consider whether to exit the process here
    // process.exit(1);
});

// Add a method to log uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // Consider whether to exit the process here
    // process.exit(1);
});

// Add a method to log process warnings
process.on('warning', (warning) => {
    logger.warn('Process Warning:', warning);
});

// Add a method to log process signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        // Perform any cleanup here
        process.exit(0);
    });
});

// Add a method to log memory usage periodically
setInterval(() => {
    const memoryUsage = process.memoryUsage();
    logger.debug('Memory Usage:', {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100} MB`
    });
}, 5 * 60 * 1000); // Log every 5 minutes

module.exports = logger;
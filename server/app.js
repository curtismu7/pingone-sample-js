/* eslint-disable no-console */
// Load environment variables
require('dotenv').config();

// Server configuration
const config = {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    https: {
        enabled: process.env.HTTPS_ENABLED === 'true',
        port: process.env.HTTPS_PORT || 3443,
        keyPath: process.env.HTTPS_KEY_PATH || 'certs/selfsigned.key',
        certPath: process.env.HTTPS_CERT_PATH || 'certs/selfsigned.crt'
    },
    logLevel: process.env.LOG_LEVEL || 'info',
    maxBodySize: process.env.MAX_BODY_SIZE || '50mb'
};

// Required dependencies
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const logger = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');

// Initialize logger
const logManager = require('./utils/logManager');

// Constants
const DEFAULT_PORT = 3000;
const MAX_BODY_SIZE = '50mb';
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // max requests per window

// Set default environment variables if not provided
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '3000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Log environment configuration
logManager.debug('Environment configuration:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL
});

// Initialize logging
logManager.logStructured('=== Server Starting ===');
logManager.info('Application Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    NODE_VERSION: process.version,
    platform: process.platform,
    memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    },
    pid: process.pid,
    uptime: process.uptime()
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logManager.error('UNCAUGHT EXCEPTION! Shutting down...', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logManager.error('UNHANDLED REJECTION! Shutting down...', err);
    process.exit(1);
});

// Initialize Express app
const app = express();

// Trust proxy
app.enable('trust proxy');

// Security middleware
// Configure Content Security Policy with basic settings
const cspConfig = {
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://unpkg.com',
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com'
        ],
        styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://unpkg.com',
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com'
        ],
        // Font sources including Font Awesome 6
        fontSrc: [
            "'self'",
            'data:',
            'https://fonts.gstatic.com',
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com',
            'https://unpkg.com'
        ],
        imgSrc: [
            "'self'",
            'data:',
            'https:',
            'blob:'
        ],
        connectSrc: [
            "'self'",
            'https://*.pingone.com',
            'https://*.pingidentity.com'
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        manifestSrc: ["'self'"]
    },
    reportOnly: process.env.NODE_ENV === 'development'
};

// Apply security headers with relaxed CSP for development
const securityMiddleware = helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? cspConfig : false,
    crossOriginEmbedderPolicy: false, // Required for some external scripts
    crossOriginOpenerPolicy: false,    // Required for some external scripts
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin resources
});

// Disable CSP in development for easier debugging
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;");
        next();
    });
}

app.use(securityMiddleware);

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    message: 'Too many requests from this IP, please try again later'
});

// Body parsers
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ limit: MAX_BODY_SIZE, extended: true }));
app.use(cookieParser());

// Data sanitization
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Compression
app.use(compression());

// CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.CORS_ORIGIN || 'https://yourdomain.com' 
        : 'http://localhost:3000',
    credentials: true
}));

// Development logging
if (process.env.NODE_ENV === 'development') {
    app.use(logger('dev', { stream: logManager.stream }));
}

// Serve static files with proper security headers
const publicPath = path.resolve(__dirname, '../public');

// Log static files directory
logManager.info('Serving static files from:', { publicPath });

// Log directory contents in development
if (process.env.NODE_ENV === 'development') {
    fs.readdir(publicPath, (err, files) => {
        if (err) {
            logManager.error('Error reading public directory:', { error: err.message });
        } else {
            logManager.debug('Public directory contents:', { files });
        }
    });
}

// Set security headers for static files
const staticOptions = {
    setHeaders: (res, path) => {
        try {
            if (!res || !path) {
                logManager.warn('Invalid arguments in static file headers', { hasRes: !!res, hasPath: !!path });
                return;
            }
            
            // Set security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            
            // Cache headers - disable caching in development, enable in production
            if (process.env.NODE_ENV === 'development') {
                // Disable caching for all files in development
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            } else {
                // Cache JS/CSS for 1 year in production
                if (typeof path === 'string' && (path.endsWith('.js') || path.endsWith('.css'))) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                } else {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                }
            }
        } catch (error) {
            logManager.error('Error setting static file headers', {
                error: error.message,
                path: path,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
};

try {
    app.use(express.static(publicPath, staticOptions));
    logManager.info('Static file serving configured successfully');
} catch (error) {
    logManager.error('Failed to configure static file serving', {
        error: error.message,
        publicPath: publicPath,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    process.exit(1);
}

// API routes with request logging
const apiLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log request details
    logManager.info(`API Request: ${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('user-agent'),
        referrer: req.get('referer'),
        contentType: req.get('content-type'),
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        params: Object.keys(req.params).length > 0 ? req.params : undefined,
        body: req.method !== 'GET' && Object.keys(req.body).length > 0 ? req.body : undefined,
        timestamp: new Date().toISOString()
    });
    
    // Log response when it's finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        const { statusCode } = res;
        
        const logData = {
            status: statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('content-length') || 0,
            timestamp: new Date().toISOString()
        };
        
        if (statusCode >= 400) {
            logManager.error(`API Response: ${req.method} ${req.originalUrl}`, logData);
        } else if (statusCode >= 300) {
            logManager.warn(`API Redirect: ${req.method} ${req.originalUrl}`, logData);
        } else {
            logManager.info(`API Response: ${req.method} ${req.originalUrl}`, logData);
        }
    });
    
    next();
};

// Apply rate limiting and logging to all API routes
app.use('/api', apiLimiter);
app.use('/api', apiLogger);

// Import routers
const importRouter = require('./routes/import');
const tokenRouter = require('./routes/token');
const deleteRouter = require('./routes/delete');
const logsRouter = require('./routes/logs');
const modifyRouter = require('./routes/modify');

// Apply API routes
app.use('/api/import', importRouter);
app.use('/api/token', tokenRouter.router);
app.use('/api/delete', deleteRouter);
app.use('/api/logs', logsRouter);
app.use('/api/modify', modifyRouter);

// 404 handler
app.all('*', (req, res, next) => {
    // Skip API routes
    if (req.originalUrl.startsWith('/api/')) {
        return next();
    }
    
    const indexPath = path.join(publicPath, 'index.html');
    
    // Log SPA route access in development
    if (process.env.NODE_ENV === 'development') {
        logManager.debug('Serving SPA route:', { 
            url: req.originalUrl,
            indexPath 
        });
    }
    
    // Check if file exists
    fs.access(indexPath, fs.constants.F_OK, (err) => {
        if (err) {
            logManager.error('SPA index.html not found', { 
                error: err.message,
                path: indexPath 
            });
            return res.status(404).json({
                status: 'error',
                message: 'Application not found'
            });
        }
        
        // Send the SPA
        res.sendFile(indexPath, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    // Default error status code
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    
    // Log the error
    logManager.error('Unhandled error:', {
        message: err.message,
        statusCode: err.statusCode,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body,
        query: req.query,
        params: req.params,
        headers: {
            'content-type': req.get('content-type')
        }
    });
    
    // Send appropriate error response
    res.status(err.statusCode).json({
        status: err.status,
        message: process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// Create HTTP/HTTPS server
let server;
let isHttps = false;

if (config.https.enabled) {
    try {
        const https = require('https');
        const fs = require('fs');
        
        // Ensure certificate files exist
        if (!fs.existsSync(config.https.keyPath) || !fs.existsSync(config.https.certPath)) {
            logManager.warn(`HTTPS certificate files not found. Falling back to HTTP.`);
            logManager.warn(`Key path: ${config.https.keyPath}`);
            logManager.warn(`Cert path: ${config.https.certPath}`);
        } else {
            const httpsOptions = {
                key: fs.readFileSync(config.https.keyPath),
                cert: fs.readFileSync(config.https.certPath)
            };
            
            server = https.createServer(httpsOptions, app);
            isHttps = true;
            logManager.info(`HTTPS server configured with certificates from ${config.https.keyPath}`);
        }
    } catch (error) {
        logManager.error('Failed to create HTTPS server', { error: error.message });
    }
}

// Fall back to HTTP if HTTPS is not enabled or failed
if (!server) {
    const http = require('http');
    server = http.createServer(app);
    logManager.info('HTTP server created (HTTPS not enabled or failed to initialize)');
}

// Handle shutdown signals
const shutdown = (signal) => {
    logManager.info(`Received ${signal}, shutting down gracefully...`);
    
    // Close server if it exists
    if (server) {
        server.close((err) => {
            if (err) {
                logManager.error('Error during server shutdown', { error: err });
                process.exit(1);
            }
            logManager.info('Server stopped');
            process.exit(0);
        });

        // Force shutdown after 5 seconds if server doesn't close gracefully
        setTimeout(() => {
            logManager.error('Forcing shutdown after timeout');
            process.exit(1);
        }, 5000);
    } else {
        logManager.info('No server instance to close');
        process.exit(0);
    }
};

// Handle various shutdown signals
['SIGTERM', 'SIGINT', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    logManager.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logManager.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
});

// Start the server
const startServer = () => {
    const httpPort = config.port;
    const httpsPort = config.https.port;
    
    // Start HTTP server
    server.listen(httpPort, () => {
        const protocol = isHttps ? 'HTTPS' : 'HTTP';
        logManager.info(`${protocol} server running in ${config.env} mode on port ${httpPort}`);
        
        // For development, log the server URL
        if (config.env === 'development') {
            const url = `http${isHttps ? 's' : ''}://localhost:${isHttps ? httpsPort : httpPort}`;
            console.log(`\n=== Server Started ===`);
            console.log(`Access the application at: ${url}`);
            if (isHttps) {
                console.log('Note: Using self-signed certificate. You may need to accept the security warning in your browser.');
            }
        }
    });
    
    // Handle server errors
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            logManager.error(`Port ${httpPort} is already in use. Please check for other running instances.`);
        } else {
            logManager.error('Server error:', error);
        }
        process.exit(1);
    });
};

// Global error handlers
process.on('uncaughtException', (error) => {
    logManager.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logManager.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
try {
    startServer();
    
    // Log server information
    logManager.info('Server information:', {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        },
        uptime: process.uptime()
    });
    
    // Handle server errors
    server.on('error', (error) => {
        logManager.error('Server error:', error);
        process.exit(1);
    });
} catch (error) {
    logManager.error('Error during server startup:', error);
    process.exit(1);
}

module.exports = app;



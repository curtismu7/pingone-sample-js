// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const logger = require('morgan');
const logManager = require('./utils/logManager');

// Initialize logging
logManager.logStructured('=== Server Starting ===');
logManager.info('Environment:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
});

// Import routers
const importRouter = require('./routes/import');
const tokenRouter = require('./routes/token');
const deleteRouter = require('./routes/delete');
const logsRouter = require('./routes/logs');
const modifyRouter = require('./routes/modify');

const app = express();

// Middleware
app.use(logger('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Serve static files from the public directory
const publicPath = path.resolve(__dirname, '../public');
console.log('Serving static files from:', publicPath);

// Log directory contents
fs.readdir(publicPath, (err, files) => {
    if (err) {
        console.error('Error reading public directory:', err);
    } else {
        console.log('Public directory contents:', files);
    }
});

app.use(express.static(publicPath));

// API routes
app.use('/api/import', (req, res, next) => {
    logManager.info(`[${req.method}] ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        contentType: req.get('content-type')
    });
    next();
}, importRouter);

app.use('/api/token', tokenRouter.router);
app.use('/api/delete', deleteRouter);
app.use('/api/logs', logsRouter);
app.use('/api/modify', modifyRouter);

// Log all requests
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        logManager.info(`[${req.method}] ${req.originalUrl}`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('content-length') || 0,
            userAgent: req.get('user-agent')
        });
    });
    
    next();
});

// Handle SPA routing - serve index.html for any other GET requests
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    console.log('Attempting to serve:', indexPath);
    
    if (fs.existsSync(indexPath)) {
        console.log('File exists, sending...');
        res.sendFile(indexPath);
    } else {
        console.error('File does not exist:', indexPath);
        res.status(404).send('File not found');
    }
});

// Error handling
app.use((err, req, res, next) => {
    logManager.error('Unhandled error:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
    });
    
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logManager.error('Unhandled Rejection at:', {
        promise,
        reason: reason.toString(),
        stack: reason.stack
    });
    // Consider whether to exit the process here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logManager.error('Uncaught Exception:', {
        error: error.toString(),
        stack: error.stack
    });
    // Consider whether to exit the process here
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    logManager.logStructured('=== Server Started ===');
    logManager.info(`Server is running on port ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage()
    });
});

// Handle server shutdown gracefully
const shutdown = () => {
    logManager.logStructured('=== Server Shutting Down ===');
    server.close(() => {
        logManager.info('Server stopped');
        process.exit(0);
    });

    // Force shutdown after 5 seconds
    setTimeout(() => {
        logManager.error('Forcing shutdown...');
        process.exit(1);
    }, 5000);
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;

const express = require('express');
const cors = require('cors');
const path = require('path');
const logManager = require('./utils/logManager');
const logger = logManager.logger; // Use the logger from the manager

// Import routes
const tokenRouter = require('./routes/token').router;
const importRouter = require('./routes/import');
const modifyRouter = require('./routes/modify');
const deleteRouter = require('./routes/delete');
const logsRouter = require('./routes/logs'); // Import the new logs router

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware - custom implementation
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip
        });
    });
    next();
});

// Serve static files from public directory
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// API Routes
app.use('/api/token', tokenRouter);
app.use('/api/import', importRouter);
app.use('/api/modify', modifyRouter);
app.use('/api/delete', deleteRouter);
app.use('/api/logs', logsRouter); // Register the new logs router

// Logging endpoint for client-side errors
app.post('/api/log', (req, res) => {
    try {
        logManager.logClientError(req.body);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to log client error', { error: error.message });
        res.status(500).json({ error: 'Failed to log error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const healthInfo = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version
    };
    logger.info('Health check requested.', healthInfo);
    res.json(healthInfo);
});

// Serve main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/settings.html'));
});

// Catch-all route should be last
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled server error', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl
    });
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const startTime = Date.now();
app.listen(PORT, () => {
    const startupTime = Date.now() - startTime;
    
    // Automatically start file logging and log server startup
    logManager.startFileLogging('import-status.log');
    logManager.logStructured(`Server started successfully (Startup time: ${startupTime} ms)`);
    
    console.log(`🚀 Ping Identity User Management Server running on http://localhost:${PORT}`);
    console.log(`📁 Static files served from: ${publicPath}`);
    console.log(`🌐 API endpoints available at: http://localhost:${PORT}/api`);
});

// Graceful shutdown
const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully.`);
    logManager.stopFileLogging();
    process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Exception handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason });
    process.exit(1);
});

module.exports = app; 
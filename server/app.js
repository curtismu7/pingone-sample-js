const express = require('express');
const cors = require('cors');
const path = require('path');
const { logger, requestLogger, logClientError } = require('./utils/logger');

// Import routes
const tokenRouter = require('./routes/token').router;
const importRouter = require('./routes/import');
const modifyRouter = require('./routes/modify');
const deleteRouter = require('./routes/delete');

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

// Request logging middleware
app.use(requestLogger);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve localization files
app.use('/locales', express.static(path.join(__dirname, '../locales')));

// API Routes
app.use('/api/token', tokenRouter);
app.use('/api/import', importRouter);
app.use('/api/modify', modifyRouter);
app.use('/api/delete', deleteRouter);

// Logging endpoint for client-side errors
app.post('/api/log', (req, res) => {
    try {
        const logEntry = req.body;
        logClientError(logEntry);
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to log client error', { error: error.message });
        res.status(500).json({ error: 'Failed to log error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version
    });
});

// Serve main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/settings.html'));
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    // Check if the request is for an API endpoint
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    // For non-API routes, serve the main page (SPA routing)
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });

    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    logger.info(`Server started`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        version: require('../package.json').version
    });
    
    console.log(`🚀 Ping Identity User Management Server running on http://localhost:${PORT}`);
    console.log(`📁 Static files served from: ${path.join(__dirname, '../public')}`);
    console.log(`🌐 API endpoints available at: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
        reason: reason,
        promise: promise
    });
    process.exit(1);
});

module.exports = app; 
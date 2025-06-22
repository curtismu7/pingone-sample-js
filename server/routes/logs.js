const express = require('express');
const router = express.Router();
const logManager = require('../utils/logManager');

// Get logs (for API testing and debugging)
router.get('/', (req, res) => {
    try {
        const logContent = logManager.getLogContent();
        res.json({
            success: true,
            message: 'Logs retrieved successfully',
            logContent: logContent,
            config: logManager.config
        });
    } catch (error) {
        logManager.logger.error('Failed to get logs', { error: error.message });
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

// Handle client log entries
router.post('/', (req, res) => {
    try {
        logManager.logClientError(req.body);
        res.json({ success: true });
    } catch (error) {
        logManager.logger.error('Failed to log client error', { error: error.message });
        res.status(500).json({ error: 'Failed to log error' });
    }
});

// Get current logging status and configuration
router.get('/config', (req, res) => {
    res.json(logManager.config);
});

// Update logging configuration
router.post('/config', (req, res) => {
    try {
        logManager.updateConfig(req.body);
        res.status(200).json({ message: 'Logging configuration updated successfully.', newConfig: logManager.config });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update logging configuration.', error: error.message });
    }
});

// Start file logging
router.post('/start', (req, res) => {
    try {
        logManager.startFileLogging();
        res.status(200).json({ message: 'File logging started.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to start file logging.', error: error.message });
    }
});

// Stop file logging
router.post('/stop', (req, res) => {
    try {
        logManager.stopFileLogging();
        res.status(200).json({ message: 'File logging stopped.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to stop file logging.', error: error.message });
    }
});

// Get log content for export
router.get('/export', (req, res) => {
    try {
        const logContent = logManager.getLogContent();
        const fileName = logManager.config.logFile || 'export.log';
        res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-type', 'text/plain');
        res.send(logContent);
    } catch (error) {
        res.status(500).json({ message: 'Failed to export log file.', error: error.message });
    }
});

// Clear the log file
router.post('/clear', (req, res) => {
    try {
        if (logManager.clearLogFile()) {
            res.status(200).json({ message: 'Log file cleared successfully.' });
        } else {
            res.status(404).json({ message: 'Log file not found.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to clear log file.', error: error.message });
    }
});

module.exports = router; 
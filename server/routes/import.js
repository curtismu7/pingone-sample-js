const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logManager = require('../utils/logManager');

// Import token functions
const { getWorkerToken } = require('./token');

const router = express.Router();
const sseConnections = new Map();

// SSE endpoint for progress updates
router.get('/progress/:operationId', (req, res) => {
    const { operationId } = req.params;
    
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });

    // Store the response object
    sseConnections.set(operationId, res);

    // Remove connection when client closes
    req.on('close', () => {
        sseConnections.delete(operationId);
    });
});

// Helper function to send progress updates
function sendProgressUpdate(operationId, data) {
    const res = sseConnections.get(operationId);
    if (res) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}

// Test route to verify getWorkerToken is working with environment variables
router.get('/test-token', async (req, res) => {
    try {
        const { 
            PINGONE_ENVIRONMENT_ID: envId,
            PINGONE_CLIENT_ID: clientId,
            PINGONE_CLIENT_SECRET: clientSecret
        } = process.env;

        if (!envId || !clientId || !clientSecret) {
            return res.status(400).json({
                success: false,
                message: 'Missing required environment variables',
                required: ['PINGONE_ENVIRONMENT_ID', 'PINGONE_CLIENT_ID', 'PINGONE_CLIENT_SECRET']
            });
        }

        console.log('Testing getWorkerToken with environment variables...');
        const token = await getWorkerToken(envId, clientId, clientSecret);
        
        res.json({ 
            success: true, 
            message: 'Successfully obtained token',
            token: token ? 'Token received (truncated for security)' : 'No token received',
            tokenExists: !!token
        });
    } catch (error) {
        console.error('Test token error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get token',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
        });
    }
});

module.exports = router;

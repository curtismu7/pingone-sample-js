const express = require('express');
const axios = require('axios');
const { logger } = require('../utils/logger');

const router = express.Router();

// In-memory token cache (in production, use Redis or similar)
const tokenCache = new Map();

// Get worker token with caching
const getWorkerToken = async (environmentId, clientId, clientSecret) => {
    const cacheKey = `${environmentId}:${clientId}`;
    const now = Date.now();
    
    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        logger.info('Token cache hit', { environmentId, clientId });
        return cached.token;
    }
    
    logger.info('Getting new worker token', { environmentId, clientId });

    // Construct the correct token endpoint URL
    const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
    
    try {
        const response = await axios.post(
            tokenUrl,
            new URLSearchParams({
                'grant_type': 'client_credentials'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
                }
            }
        );
        
        if (response.data && response.data.access_token) {
            // Cache token for 55 minutes (PingOne tokens typically last 1 hour)
            const expiresAt = now + (55 * 60 * 1000);
            tokenCache.set(cacheKey, {
                token: response.data.access_token,
                expiresAt: expiresAt
            });
            
            logger.info('Worker token obtained and cached', { 
                environmentId, 
                clientId,
                expiresAt: new Date(expiresAt).toISOString()
            });
            
            return response.data.access_token;
        } else {
            throw new Error('Invalid token response from PingOne');
        }
    } catch (error) {
        logger.error('Failed to get worker token from PingOne', {
            environmentId,
            clientId,
            url: tokenUrl,
            error: error.message,
            statusCode: error.response?.status,
            response: error.response?.data
        });

        // Re-throw a more specific error
        if (error.response) {
            const { status, data } = error.response;
            throw new Error(`PingOne API error (${status}): ${JSON.stringify(data)}`);
        } else {
            throw new Error(`Failed to communicate with PingOne API: ${error.message}`);
        }
    }
};

// POST /api/token - Get worker token
router.post('/', async (req, res) => {
    try {
        const { environmentId, clientId, clientSecret } = req.body;
        
        // Validate required fields
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: environmentId, clientId, and clientSecret are all required.'
            });
        }
        
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        res.json({
            access_token: token,
            token_type: 'Bearer',
            expires_in: 3300 // 55 minutes in seconds
        });
        
    } catch (error) {
        logger.error('Token endpoint processing error', {
            errorMessage: error.message,
            stack: error.stack
        });
        
        // Check for specific error messages from getWorkerToken
        if (error.message.includes('PingOne API error (401)')) {
            res.status(401).json({
                error: 'Invalid PingOne credentials. Please check your Client ID and Client Secret.'
            });
        } else if (error.message.includes('PingOne API error (400)')) {
            res.status(400).json({
                error: 'Invalid request to PingOne. Please check your Environment ID.'
            });
        } else {
            res.status(500).json({
                error: 'An internal server error occurred while trying to get a token from PingOne.'
            });
        }
    }
});

// GET /api/token/status - Get token cache status
router.get('/status', (req, res) => {
    const { environmentId, clientId } = req.query;
    
    if (!environmentId || !clientId) {
        return res.status(400).json({
            error: 'Missing required query parameters: environmentId, clientId'
        });
    }
    
    const cacheKey = `${environmentId}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && cached.expiresAt > now) {
        const timeRemaining = Math.floor((cached.expiresAt - now) / 1000);
        res.json({
            valid: true,
            expiresIn: timeRemaining,
            expiresAt: new Date(cached.expiresAt).toISOString()
        });
    } else {
        res.json({
            valid: false,
            expiresIn: 0,
            expiresAt: null
        });
    }
});

// DELETE /api/token - Clear token cache
router.delete('/', (req, res) => {
    const { environmentId, clientId } = req.query;
    
    if (environmentId && clientId) {
        // Clear specific token
        const cacheKey = `${environmentId}:${clientId}`;
        tokenCache.delete(cacheKey);
        logger.info('Specific token cleared from cache', { environmentId, clientId });
    } else {
        // Clear all tokens
        tokenCache.clear();
        logger.info('All tokens cleared from cache');
    }
    
    res.json({ success: true });
});

module.exports = {
    router,
    getWorkerToken
}; 
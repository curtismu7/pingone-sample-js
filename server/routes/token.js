// PingOne Token Management Routes
// This file handles authentication and token management for PingOne API
// Debugging: Check server logs for detailed authentication flow

const express = require('express');
const axios = require('axios');
const logManager = require('../utils/logManager');

const router = express.Router();

// Token cache to avoid unnecessary API calls
// DEBUG: Check tokenCache in memory for current token status
let tokenCache = {};

// Helper function to check if token is still valid
// DEBUG: If tokens expire unexpectedly, check this validation logic
function isTokenValid(tokenData) {
    if (!tokenData || !tokenData.access_token || !tokenData.expiresAt) {
        return false;
    }
    
    // Add 5-minute buffer before expiration
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    const now = Date.now();
    const expiresAt = tokenData.expiresAt;
    
    const isValid = now < (expiresAt - bufferTime);
    
    // DEBUG: Log token validation details
    if (!isValid) {
        logManager.info('Token validation failed', {
            now: new Date(now).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
            bufferTime: bufferTime / 1000 + ' seconds'
        });
    }
    
    return isValid;
}

// Helper function to create cache key
// DEBUG: If token caching isn't working, check key generation
function createCacheKey(environmentId, clientId) {
    return `${environmentId}:${clientId}`;
}

// Get worker token with caching
const getWorkerToken = async (environmentId, clientId, clientSecret) => {
    const cacheKey = createCacheKey(environmentId, clientId);
    const now = Date.now();
    
    // Check cache first
    const cached = tokenCache[cacheKey];
    if (cached && isTokenValid(cached)) {
        const timeRemaining = Math.floor((cached.expiresAt - now) / (60 * 1000));
        logManager.logWorkerTokenReused(`${timeRemaining} mins`);
        return cached.access_token;
    }
    
    logManager.info('Getting new worker token', { environmentId, clientId });
    logManager.logWorkerTokenRequested();

    // Construct the correct token endpoint URL
    const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
    
    // Create the authorization header
    const authString = `${clientId}:${clientSecret}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
    
    logManager.info('Token request details', {
        url: tokenUrl,
        environmentId: environmentId.substring(0, 8) + '...',
        clientId: clientId.substring(0, 8) + '...',
        authHeaderLength: authHeader.length,
        hasClientSecret: !!clientSecret && clientSecret.length > 0
    });
    
    try {
        const response = await axios.post(
            tokenUrl,
            new URLSearchParams({
                'grant_type': 'client_credentials'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': authHeader
                },
                timeout: 10000 // 10 second timeout
            }
        );
        
        if (response.data && response.data.access_token) {
            // Cache token for 55 minutes (PingOne tokens typically last 1 hour)
            const expiresAt = now + (55 * 60 * 1000);
            tokenCache[cacheKey] = {
                access_token: response.data.access_token,
                token_type: response.data.token_type,
                expiresAt: expiresAt,
                environmentId,
                clientId,
                createdAt: Date.now()
            };
            
            logManager.info('Worker token obtained and cached', { 
                environmentId, 
                clientId,
                expiresAt: new Date(expiresAt).toISOString(),
                tokenType: response.data.token_type,
                scope: response.data.scope
            });
            
            logManager.logWorkerTokenReceived(55);
            
            return response.data.access_token;
        } else {
            throw new Error('Invalid token response from PingOne');
        }
    } catch (error) {
        logManager.error('Failed to get worker token from PingOne', {
            environmentId,
            clientId,
            url: tokenUrl,
            error: error.message,
            statusCode: error.response?.status,
            statusText: error.response?.statusText,
            response: error.response?.data,
            headers: error.response?.headers,
            requestHeaders: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic [REDACTED]'
            }
        });
        
        logManager.logWorkerTokenFailed();

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
        logManager.error('Token endpoint processing error', {
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

// POST /api/token/worker - Get worker token (alternative endpoint)
router.post('/worker', async (req, res) => {
    try {
        const { environmentId, clientId, clientSecret } = req.body;
        
        // Validate required fields
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: environmentId, clientId, and clientSecret are all required.'
            });
        }
        
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        res.json({
            success: true,
            data: {
                access_token: token,
                token_type: 'Bearer',
                expires_in: 3300 // 55 minutes in seconds
            }
        });
        
    } catch (error) {
        logManager.error('Worker token endpoint processing error', {
            errorMessage: error.message,
            stack: error.stack
        });
        
        // Check for specific error messages from getWorkerToken
        if (error.message.includes('PingOne API error (401)')) {
            res.status(401).json({
                success: false,
                error: 'Invalid PingOne credentials. Please check your Client ID and Client Secret.'
            });
        } else if (error.message.includes('PingOne API error (400)')) {
            res.status(400).json({
                success: false,
                error: 'Invalid request to PingOne. Please check your Environment ID.'
            });
        } else {
            res.status(500).json({
                success: false,
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
    
    const cacheKey = createCacheKey(environmentId, clientId);
    const cached = tokenCache[cacheKey];
    const now = Date.now();
    
    if (cached && isTokenValid(cached)) {
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

// POST /api/token/test - Test credentials without caching
router.post('/test', async (req, res) => {
    try {
        const { environmentId, clientId, clientSecret } = req.body;
        
        // Validate required fields
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: environmentId, clientId, and clientSecret are all required.',
                received: {
                    environmentId: !!environmentId,
                    clientId: !!clientId,
                    clientSecret: !!clientSecret
                }
            });
        }
        
        // Validate field formats
        const errors = [];
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(environmentId)) {
            errors.push('Environment ID must be a valid UUID format');
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
            errors.push('Client ID must be a valid UUID format');
        }
        if (clientSecret.length < 10) {
            errors.push('Client Secret appears to be too short');
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Invalid credential format',
                details: errors
            });
        }
        
        logManager.info('Testing PingOne credentials', {
            environmentId: environmentId.substring(0, 8) + '...',
            clientId: clientId.substring(0, 8) + '...',
            secretLength: clientSecret.length
        });
        
        // Force a fresh token request (bypass cache)
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // Test the token by making a simple API call
        const testUrl = `https://api.pingone.com/v1/environments/${environmentId}`;
        const testResponse = await axios.get(testUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        logManager.info('Credentials test successful', {
            environmentId: environmentId.substring(0, 8) + '...',
            environmentName: testResponse.data.name,
            tokenLength: token.length
        });
        
        res.json({
            success: true,
            message: 'Credentials are valid and working',
            environment: {
                id: environmentId,
                name: testResponse.data.name,
                type: testResponse.data.type
            },
            token: {
                length: token.length,
                expires_in: 3300
            }
        });
        
    } catch (error) {
        logManager.error('Credentials test failed', {
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        let errorMessage = 'Failed to validate credentials';
        let statusCode = 500;
        
        if (error.message.includes('PingOne API error (401)')) {
            errorMessage = 'Invalid credentials - Please check your Client ID and Client Secret';
            statusCode = 401;
        } else if (error.message.includes('PingOne API error (400)')) {
            errorMessage = 'Invalid Environment ID - Please check your Environment ID';
            statusCode = 400;
        } else if (error.message.includes('PingOne API error (403)')) {
            errorMessage = 'Access denied - Please check your client application permissions';
            statusCode = 403;
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: error.response?.data || error.message
        });
    }
});

// DELETE /api/token - Clear token cache
router.delete('/', (req, res) => {
    const { environmentId, clientId } = req.query;
    
    if (environmentId && clientId) {
        // Clear specific token
        const cacheKey = createCacheKey(environmentId, clientId);
        if (tokenCache[cacheKey]) {
            delete tokenCache[cacheKey];
            logManager.info('Specific token cleared from cache', { environmentId, clientId });
        } else {
            logManager.info('No token found in cache for specified environment', { environmentId, clientId });
        }
    } else {
        // Clear all tokens
        const cacheSize = Object.keys(tokenCache).length;
        tokenCache = {};
        logManager.info('All tokens cleared from cache', { previousCacheSize: cacheSize });
    }
    
    res.json({ success: true });
});

module.exports = {
    router,
    getWorkerToken
}; 
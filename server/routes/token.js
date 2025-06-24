// PingOne Token Management Routes
// This file handles authentication and token management for PingOne API
// Debugging: Check server logs for detailed authentication flow

const express = require('express');
const axios = require('axios');
const logManager = require('../utils/logManager');

const router = express.Router();

// Token cache to avoid unnecessary API calls
// DEBUG: Check tokenCache in memory for current token status
exports.tokenCache = {};

// Token configuration
const TOKEN_CONFIG = {
    CACHE_DURATION: 50 * 60 * 1000, // 50 minutes in milliseconds
    BUFFER_TIME: 2 * 60 * 1000,     // 2 minutes buffer before expiration
    MAX_AGE: 60 * 60 * 1000         // 1 hour maximum (PingOne default)
};

// Helper function to check if token is still valid
// DEBUG: If tokens expire unexpectedly, check this validation logic
function isTokenValid(tokenData) {
    if (!tokenData || !tokenData.access_token || !tokenData.expiresAt) {
        return false;
    }
    
    const now = Date.now();
    const expiresAt = tokenData.expiresAt;
    
    // Use 2-minute buffer before expiration for safety
    const isValid = now < (expiresAt - TOKEN_CONFIG.BUFFER_TIME);
    
    // DEBUG: Log token validation details
    if (!isValid) {
        logManager.info('Token validation failed', {
            now: new Date(now).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
            bufferTime: TOKEN_CONFIG.BUFFER_TIME / 1000 + ' seconds',
            tokenAge: Math.floor((now - tokenData.createdAt) / (60 * 1000)) + ' minutes'
        });
    }
    
    return isValid;
}

// Helper function to create cache key
// DEBUG: If token caching isn't working, check key generation
function createCacheKey(environmentId, clientId) {
    return `${environmentId}:${clientId}`;
}

// Helper function to calculate and log token age information
function logTokenAgeInfo(tokenData, action = 'reused') {
    const now = Date.now();
    const ageMinutes = Math.floor((now - tokenData.createdAt) / (60 * 1000));
    const timeRemaining = Math.floor((tokenData.expiresAt - now) / (60 * 1000));
    const agePercentage = Math.round((ageMinutes / (TOKEN_CONFIG.CACHE_DURATION / (60 * 1000))) * 100);
    
    // Log to structured format for better visibility in log file
    logManager.info(`TOKEN ${action.toUpperCase()} - Age Details`, {
        tokenAge: `${ageMinutes} minutes`,
        timeRemaining: `${timeRemaining} minutes`,
        agePercentage: `${agePercentage}% of cache duration`,
        createdAt: new Date(tokenData.createdAt).toISOString(),
        expiresAt: new Date(tokenData.expiresAt).toISOString(),
        cacheDuration: `${TOKEN_CONFIG.CACHE_DURATION / (60 * 1000)} minutes`,
        environmentId: tokenData.environmentId.substring(0, 8) + '...',
        clientId: tokenData.clientId.substring(0, 8) + '...'
    });
    
    // Also log in simple format for easy reading
    logManager.logStructured(`TOKEN ${action.toUpperCase()}: Age=${ageMinutes}m, Remaining=${timeRemaining}m, Usage=${agePercentage}%`);
}

// Get worker token with caching
const getWorkerToken = async (environmentId, clientId, clientSecret) => {
    const cacheKey = createCacheKey(environmentId, clientId);
    const now = Date.now();
    
    // Check cache first
    const cached = exports.tokenCache[cacheKey];
    if (cached && isTokenValid(cached)) {
        // Log detailed token age information
        logTokenAgeInfo(cached, 'reused');
        
        const timeRemaining = Math.floor((cached.expiresAt - now) / (60 * 1000));
        logManager.logStructured(`TOKEN REUSED: ${timeRemaining} minutes remaining`);
        logManager.logWorkerTokenReused(`${timeRemaining} mins`);
        return cached.access_token;
    }

    // If no valid cached token, get a new one
    try {
        logManager.logStructured('TOKEN REQUEST: Fetching new token');
        
        const tokenResponse = await axios.post(
            `https://auth.pingone.com/${environmentId}/as/token`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, expires_in } = tokenResponse.data;
        const expiresAt = now + (expires_in * 1000);
        
        // Cache the new token
        exports.tokenCache[cacheKey] = {
            access_token,
            expiresAt,
            createdAt: now,
            environmentId,
            clientId
        };

        // Log token age info
        logTokenAgeInfo(exports.tokenCache[cacheKey], 'created');
        
        logManager.logStructured('TOKEN CREATED: New token obtained and cached');
        logManager.logWorkerTokenCreated();
        
        return access_token;
    } catch (error) {
        logManager.error('TOKEN ERROR: Failed to get worker token', {
            error: error.message,
            environmentId: environmentId.substring(0, 8) + '...',
            clientId: clientId.substring(0, 8) + '...'
        });
        throw error;
    }
};

// Export the function
exports.getWorkerToken = getWorkerToken;

const getUserIdByUsername = async (username, environmentId, token) => {
    const url = `https://api.pingone.com/v1/environments/${environmentId}/users?filter=username eq "${username}"`;
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.data && response.data._embedded && response.data._embedded.users && response.data._embedded.users.length > 0) {
            return response.data._embedded.users[0].id;
        }
        return null;
    } catch (error) {
        logManager.error('Failed to get user ID by username', {
            username,
            error: error.message,
            statusCode: error.response?.status
        });
        throw new Error('Could not retrieve user from PingOne.');
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
            expires_in: 3000 // 50 minutes in seconds
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
                expires_in: 3000 // 50 minutes in seconds
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
    const cached = exports.tokenCache[cacheKey];
    const now = Date.now();
    
    if (cached && isTokenValid(cached)) {
        const timeRemaining = Math.floor((cached.expiresAt - now) / 1000);
        const ageMinutes = Math.floor((now - cached.createdAt) / (60 * 1000));
        const agePercentage = Math.round((ageMinutes / (TOKEN_CONFIG.CACHE_DURATION / (60 * 1000))) * 100);
        
        res.json({
            valid: true,
            expiresIn: timeRemaining,
            expiresAt: new Date(cached.expiresAt).toISOString(),
            age: {
                minutes: ageMinutes,
                percentage: agePercentage,
                createdAt: new Date(cached.createdAt).toISOString()
            },
            cache: {
                duration: TOKEN_CONFIG.CACHE_DURATION / 1000,
                bufferTime: TOKEN_CONFIG.BUFFER_TIME / 1000
            }
        });
    } else {
        res.json({
            valid: false,
            expiresIn: 0,
            expiresAt: null,
            age: null,
            cache: {
                duration: TOKEN_CONFIG.CACHE_DURATION / 1000,
                bufferTime: TOKEN_CONFIG.BUFFER_TIME / 1000
            }
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
                error: 'Missing required fields: environmentId, clientId, and clientSecret are all required.'
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
                expires_in: 3000
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
        if (exports.tokenCache[cacheKey]) {
            delete exports.tokenCache[cacheKey];
            logManager.info('Specific token cleared from cache', { environmentId, clientId });
        } else {
            logManager.info('No token found in cache for specified environment', { environmentId, clientId });
        }
    } else {
        // Clear all tokens
        const cacheSize = Object.keys(exports.tokenCache).length;
        exports.tokenCache = {};
        logManager.info('All tokens cleared from cache', { previousCacheSize: cacheSize });
    }
    
    res.json({ success: true });
});

// GET /api/token/cache - Get detailed cache information
router.get('/cache', (req, res) => {
    const now = Date.now();
    const cacheInfo = {
        totalTokens: Object.keys(exports.tokenCache).length,
        configuration: {
            cacheDuration: TOKEN_CONFIG.CACHE_DURATION / 1000,
            bufferTime: TOKEN_CONFIG.BUFFER_TIME / 1000,
            maxAge: TOKEN_CONFIG.MAX_AGE / 1000
        },
        tokens: []
    };
    
    for (const [cacheKey, tokenData] of Object.entries(exports.tokenCache)) {
        const [environmentId, clientId] = cacheKey.split(':');
        const ageMinutes = Math.floor((now - tokenData.createdAt) / (60 * 1000));
        const timeRemaining = Math.floor((tokenData.expiresAt - now) / (60 * 1000));
        const isValid = isTokenValid(tokenData);
        
        cacheInfo.tokens.push({
            cacheKey,
            environmentId: environmentId.substring(0, 8) + '...',
            clientId: clientId.substring(0, 8) + '...',
            valid: isValid,
            age: {
                minutes: ageMinutes,
                percentage: Math.round((ageMinutes / (TOKEN_CONFIG.CACHE_DURATION / (60 * 1000))) * 100)
            },
            expiresIn: timeRemaining,
            createdAt: new Date(tokenData.createdAt).toISOString(),
            expiresAt: new Date(tokenData.expiresAt).toISOString()
        });
    }
    
    res.json(cacheInfo);
});

// Export the router and functions
module.exports = {
    router,
    getWorkerToken,
    getUserIdByUsername,
    tokenCache
};

// Export individual functions for direct import
exports.getUserIdByUsername = getUserIdByUsername;
exports.tokenCache = tokenCache;

// Keep the existing router export for backward compatibility
module.exports = router;
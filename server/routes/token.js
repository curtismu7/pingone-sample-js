const express = require('express');
const axios = require('axios');
const logManager = require('../utils/logManager');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Validation middleware for token test endpoint
const validateTokenTest = [
    body('environmentId').isString().trim().notEmpty().withMessage('Environment ID is required'),
    body('clientId').isString().trim().notEmpty().withMessage('Client ID is required'),
    body('clientSecret').isString().trim().notEmpty().withMessage('Client secret is required'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                errors: errors.array().map(err => ({
                    param: err.param,
                    message: err.msg,
                    value: err.value
                }))
            });
        }
        // Sanitize input
        req.sanitizedBody = {
            environmentId: req.body.environmentId.trim(),
            clientId: req.body.clientId.trim(),
            clientSecret: req.body.clientSecret.trim()
        };
        next();
    }
];

// Rate limiting for token endpoints - more permissive settings
const tokenLimiter = rateLimit({
    windowMs: process.env.NODE_ENV === 'development' ? 60 * 1000 : 5 * 60 * 1000, // 1 min in dev, 5 min in prod
    max: process.env.NODE_ENV === 'development' ? 100 : 300, // Much higher limits
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for certain paths or in development
        return process.env.NODE_ENV === 'development' || 
               req.path.includes('/api/token/test');
    },
    handler: (req, res, next, options) => {
        logManager.warn('Rate limit reached', { 
            ip: req.ip, 
            path: req.path,
            method: req.method,
            headers: req.headers
        });
        res.status(options.statusCode).json({
            success: false,
            error: 'Too many requests, please try again later',
            retryAfter: Math.ceil(options.windowMs / 1000) + ' seconds',
            limit: options.max,
            current: req.rateLimit.current,
            remaining: req.rateLimit.remaining,
            resetTime: req.rateLimit.resetTime
        });
    }
});

// Token cache configuration
const TOKEN_CONFIG = {
    CACHE_DURATION: 55 * 60 * 1000, // 55 minutes in milliseconds (token lifetime)
    BUFFER_TIME: 5 * 60 * 1000,     // 5 minutes buffer time before expiration
    MAX_AGE: 60 * 60 * 1000         // 1 hour maximum (PingOne default)
};

// Token cache storage
const tokenCache = {};

// Helper function to check if token is still valid
function isTokenValid(tokenData) {
    if (!tokenData || !tokenData.access_token || !tokenData.expiresAt) {
        return false;
    }
    const now = Date.now();
    const expiresAt = tokenData.expiresAt;
    return now < expiresAt - TOKEN_CONFIG.BUFFER_TIME;
}

// Helper function to create cache key
function createCacheKey(environmentId, clientId) {
    return `${environmentId}:${clientId}`;
}

/**
 * Get worker token with caching and retry logic
 * @param {string} environmentId - PingOne environment ID
 * @param {string} clientId - Client ID for authentication
 * @param {string} clientSecret - Client secret for authentication
 * @returns {Promise<string>} Access token
 * @throws {Error} If token retrieval fails
 */
async function getWorkerToken(environmentId, clientId, clientSecret) {
    const cacheKey = createCacheKey(environmentId, clientId);
    const now = Date.now();
    
    // Check cache first
    const cached = tokenCache[cacheKey];
    if (cached && isTokenValid(cached)) {
        logManager.debug('Using cached token', { cacheKey: cacheKey.substring(0, 8) + '...' });
        return cached.access_token;
    }

    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logManager.info(`Fetching new token (attempt ${attempt}/${maxRetries})`);
            const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const response = await axios({
                method: 'post',
                url: `https://auth.pingone.com/${environmentId}/as/token`,
                data: 'grant_type=client_credentials',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json'
                },
                timeout: 10000, // 10 second timeout
                validateStatus: null // Don't throw on HTTP error status
            });

            if (response.status >= 400) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            if (!response.data || !response.data.access_token) {
                throw new Error('Invalid token response from server');
            }

            // Override the token expiration with our desired cache duration
            // PingOne tokens typically expire in 1 hour, but we'll enforce 55 minutes
            const tokenExpiry = Math.min(
                now + (response.data.expires_in * 1000), // Original expiry
                now + TOKEN_CONFIG.CACHE_DURATION // Our max cache duration (55 min)
            );

            const tokenData = {
                access_token: response.data.access_token,
                expiresAt: tokenExpiry,
                token_type: response.data.token_type,
                cachedAt: now
            };

            // Cache the token
            tokenCache[cacheKey] = tokenData;
            logManager.info('Successfully obtained new token', { 
                expiresIn: Math.floor((tokenExpiry - now) / 1000) + 's',
                tokenType: response.data.token_type,
                cachedUntil: new Date(tokenExpiry).toISOString()
            });
            
            return tokenData.access_token;

        } catch (error) {
            lastError = error;
            const delay = attempt * 1000; // Exponential backoff
            logManager.warn(`Token fetch attempt ${attempt} failed, retrying in ${delay}ms`, { 
                error: error.message 
            });
            
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    logManager.error('Failed to obtain token after multiple attempts', { 
        error: lastError?.message || 'Unknown error' 
    });
    throw new Error(`Failed to get worker token: ${lastError?.message || 'Unknown error'}`);
}

/**
 * @swagger
 * /api/token/test:
 *   post:
 *     tags: [Authentication]
 *     summary: Test PingOne credentials
 *     description: Validates PingOne credentials without generating a token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - environmentId
 *               - clientId
 *             properties:
 *               environmentId:
 *                 type: string
 *                 description: PingOne Environment ID
 *               clientId:
 *                 type: string
 *                 description: PingOne Client ID
 *               clientSecret:
 *                 type: string
 *                 description: PingOne Client Secret (required if using client credentials)
 *     responses:
 *       200:
 *         description: Credentials are valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Credentials are valid
 *       400:
 *         description: Invalid input parameters
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post('/test', tokenLimiter, validateTokenTest, async (req, res) => {
    try {
        const { environmentId, clientId, clientSecret } = req.sanitizedBody;
        
        // Simple test to validate credentials by trying to get a token
        const auth = Buffer.from(`${clientId}:${clientSecret || ''}`).toString('base64');
        
        const response = await axios({
            method: 'post',
            url: `https://auth.pingone.com/${environmentId}/as/token`,
            data: 'grant_type=client_credentials',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            },
            timeout: 10000, // 10 second timeout
            validateStatus: null // Don't throw on HTTP error status
        });

        if (response.status === 200 && response.data && response.data.access_token) {
            // Credentials are valid
            logManager.info('Credentials test successful', { environmentId: environmentId.substring(0, 8) + '...' });
            return res.status(200).json({
                success: true,
                message: 'Credentials are valid',
                data: {
                    tokenType: response.data.token_type,
                    expiresIn: response.data.expires_in
                }
            });
        } else if (response.status === 401) {
            // Invalid credentials
            logManager.warn('Invalid credentials provided', { environmentId: environmentId.substring(0, 8) + '...' });
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials. Please check your Client ID and Client Secret.'
            });
        } else {
            // Other error
            const errorMessage = response.data?.error_description || response.statusText || 'Unknown error';
            logManager.error('Credentials test failed', { 
                status: response.status,
                error: errorMessage 
            });
            return res.status(response.status || 500).json({
                success: false,
                error: errorMessage
            });
        }
    } catch (error) {
        logManager.error('Error testing credentials', { 
            error: error.message,
            stack: error.stack 
        });
        return res.status(500).json({
            success: false,
            error: 'An error occurred while testing credentials',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


// Test endpoint for token verification
router.post('/test', tokenLimiter, validateTokenTest, async (req, res) => {
    const { environmentId, clientId, clientSecret } = req.body;
    
    try {
        logManager.info('Testing PingOne credentials', { 
            environmentId: environmentId.substring(0, 8) + '...',
            clientId: clientId.substring(0, 8) + '...'
        });

        // Get token first to validate credentials
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // If we got here, credentials are valid, now get environment details
        const envResponse = await axios.get(
            `https://api.pingone.com/v1/environments/${environmentId}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Return success with environment details
        res.json({ 
            success: true, 
            data: {
                environment: {
                    id: environmentId,
                    name: envResponse.data.name || 'PingOne Environment'
                }
            }
        });
    } catch (error) {
        console.error('Test token error:', error);
        res.status(500).json({ 
            error: 'Failed to get token',
            details: error.message 
        });
    }
});

// Worker token endpoint
router.post('/worker', tokenLimiter, async (req, res) => {
    try {
        const { environmentId, clientId, clientSecret } = req.body;
        
        if (!environmentId || !clientId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: environmentId and clientId are required',
                required: ['environmentId', 'clientId']
            });
        }

        // Get the worker token using the existing function
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // Get the token data from cache
        const cacheKey = createCacheKey(environmentId, clientId);
        const tokenData = tokenCache[cacheKey];
        
        if (!tokenData) {
            throw new Error('Token was generated but not found in cache');
        }

        // Calculate time until expiration
        const expiresIn = Math.floor((tokenData.expiresAt - Date.now()) / 1000);
        
        logManager.info('Worker token issued', { 
            environmentId: environmentId.substring(0, 8) + '...',
            clientId: clientId.substring(0, 8) + '...',
            expiresIn: expiresIn + 's'
        });

        // Return the token and expiration info
        res.json({
            success: true,
            data: {
                access_token: token,
                token_type: 'Bearer',
                expires_in: expiresIn,
                expires_at: tokenData.expiresAt,
                cached: true
            }
        });
        
    } catch (error) {
        logManager.error('Failed to issue worker token', { 
            error: error.message,
            stack: error.stack 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to get worker token',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Export the router and functions
module.exports = {
    router,
    getWorkerToken,
    tokenCache,
    isTokenValid,
    createCacheKey,
    tokenLimiter
};

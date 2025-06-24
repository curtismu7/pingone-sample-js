const express = require('express');
const axios = require('axios');
const logManager = require('../utils/logManager');

const router = express.Router();

// Token cache configuration
const TOKEN_CONFIG = {
    CACHE_DURATION: 50 * 60 * 1000, // 50 minutes in milliseconds
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

// Get worker token with caching
async function getWorkerToken(environmentId, clientId, clientSecret) {
    const cacheKey = createCacheKey(environmentId, clientId);
    const now = Date.now();
    
    // Check cache first
    const cached = tokenCache[cacheKey];
    if (cached && isTokenValid(cached)) {
        return cached.access_token;
    }

    try {
        // Get new token
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const response = await axios.post(
            `https://auth.pingone.com/${environmentId}/as/token`,
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`
                }
            }
        );

        const tokenData = {
            access_token: response.data.access_token,
            expiresAt: now + (response.data.expires_in * 1000),
            token_type: response.data.token_type
        };

        // Cache the token
        tokenCache[cacheKey] = tokenData;
        return tokenData.access_token;

    } catch (error) {
        console.error('Error getting worker token:', error);
        throw new Error('Failed to get worker token');
    }
}

// Export the router and functions
module.exports = {
    router,
    getWorkerToken,
    tokenCache,
    isTokenValid,
    createCacheKey
};

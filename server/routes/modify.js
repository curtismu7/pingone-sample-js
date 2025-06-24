const express = require('express');
const axios = require('axios');
const logManager = require('../utils/logManager');
const { getWorkerToken } = require('./token');

const router = express.Router();

// Store active SSE connections
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
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Store connection
    sseConnections.set(operationId, res);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', operationId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
        sseConnections.delete(operationId);
    });
});

// Helper function to send progress updates
function sendProgressUpdate(operationId, data) {
    const connection = sseConnections.get(operationId);
    if (connection) {
        connection.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}

// PUT /api/modify/user/:userId - Modify a specific user
router.put('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { userData, environmentId, clientId, clientSecret } = req.body;
        
        if (!userData || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: userData, environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Modifying user', {
            userId,
            environmentId,
            fields: Object.keys(userData)
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        const response = await axios.put(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
            userData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User modified successfully', {
            userId,
            environmentId
        });

        res.json({
            success: true,
            user: response.data,
            message: 'User modified successfully'
        });

    } catch (error) {
        logManager.error('User modification error', {
            userId: req.params.userId,
            error: error.message,
            response: error.response?.data
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found'
            });
        } else if (error.response?.status === 400) {
            res.status(400).json({
                error: 'Invalid user data',
                details: error.response.data
            });
        } else {
            res.status(500).json({
                error: 'Failed to modify user',
                details: error.message
            });
        }
    }
});

// PATCH /api/modify/user/:userId - Partially update a user
router.patch('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { userData, environmentId, clientId, clientSecret } = req.body;
        
        if (!userData || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: userData, environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Partially updating user', {
            userId,
            environmentId,
            fields: Object.keys(userData)
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        const response = await axios.patch(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
            userData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User partially updated successfully', {
            userId,
            environmentId
        });

        res.json({
            success: true,
            user: response.data,
            message: 'User updated successfully'
        });

    } catch (error) {
        logManager.error('User partial update error', {
            userId: req.params.userId,
            error: error.message,
            response: error.response?.data
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found'
            });
        } else if (error.response?.status === 400) {
            res.status(400).json({
                error: 'Invalid user data',
                details: error.response.data
            });
        } else {
            res.status(500).json({
                error: 'Failed to update user',
                details: error.message
            });
        }
    }
});

// POST /api/modify/bulk - Bulk modify users
router.post('/bulk', async (req, res) => {
    const startTime = Date.now();
    const operationId = `modify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        const { users, environmentId, clientId, clientSecret } = req.body;
        
        if (!users || !Array.isArray(users) || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: users (array), environmentId, clientId, clientSecret'
            });
        }

        // Send initial progress update
        sendProgressUpdate(operationId, {
            type: 'progress',
            current: 0,
            total: users.length,
            success: 0,
            errors: 0,
            skipped: 0,
            message: 'Starting bulk modification...'
        });

        logManager.info('Starting bulk user modification', {
            userCount: users.length,
            environmentId,
            operationId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // Send token acquisition update
        sendProgressUpdate(operationId, {
            type: 'progress',
            current: 0,
            total: users.length,
            success: 0,
            errors: 0,
            skipped: 0,
            message: 'Getting authentication token...'
        });
        
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < users.length; i++) {
            const userUpdate = users[i];
            try {
                const { userId, userData, username } = userUpdate;
                
                if (!userId && !username) {
                    throw new Error('Missing userId or username');
                }
                
                if (!userData) {
                    throw new Error('Missing userData');
                }

                let targetUserId = userId;
                let currentUserData = null;
                
                // If we have username but no userId, find the user first
                if (!userId && username) {
                    logManager.info('Finding user by username for modification', { username });
                    
                    const searchResponse = await axios.get(
                        `https://api.pingone.com/v1/environments/${environmentId}/users`,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            params: {
                                filter: `username eq \"${username}\"`
                            }
                        }
                    );

                    if (!searchResponse.data._embedded?.users?.length) {
                        throw new Error(`User not found with username: ${username}`);
                    }
                    
                    targetUserId = searchResponse.data._embedded.users[0].id;
                    currentUserData = searchResponse.data._embedded.users[0];
                } else {
                    // Fetch current user data by userId
                    const getUserResponse = await axios.get(
                        `https://api.pingone.com/v1/environments/${environmentId}/users/${targetUserId}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    currentUserData = getUserResponse.data;
                }

                // Compare userData to currentUserData (shallow compare for relevant fields)
                const isNoChange = Object.keys(userData).every(key => {
                    // For nested objects (like name), do a shallow compare
                    if (typeof userData[key] === 'object' && userData[key] !== null && currentUserData[key]) {
                        return Object.keys(userData[key]).every(subKey => {
                            return userData[key][subKey] === currentUserData[key][subKey];
                        });
                    } else {
                        return userData[key] === currentUserData[key];
                    }
                });

                if (isNoChange) {
                    results.push({
                        userId: targetUserId,
                        username: username || 'unknown',
                        status: 'skipped',
                        message: 'No changes detected (skipped)',
                        user: currentUserData
                    });
                    logManager.logUserAction('modify', { userId: targetUserId, username, status: 'skipped', message: 'No changes detected (skipped)', });
                    skippedCount++;
                } else {
                    // Only PATCH if there are changes
                    const response = await axios.patch(
                        `https://api.pingone.com/v1/environments/${environmentId}/users/${targetUserId}`,
                        userData,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    results.push({
                        userId: targetUserId,
                        username: username || 'unknown',
                        status: 'success',
                        message: 'User modified successfully',
                        user: response.data
                    });
                    logManager.logUserAction('modify', { userId: targetUserId, username, status: 'success', message: 'User modified successfully', });
                    
                    successCount++;
                }
                
            } catch (error) {
                logManager.error('Individual user modification error', {
                    userId: userUpdate.userId,
                    username: userUpdate.username,
                    error: error.message,
                    status: error.response?.status,
                    responseData: error.response?.data
                });
                
                const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message;
                
                results.push({
                    userId: userUpdate.userId || 'unknown',
                    username: userUpdate.username || 'unknown',
                    status: 'error',
                    message: errorMessage
                });
                logManager.logUserAction('modify', { userId: userUpdate.userId || 'unknown', username: userUpdate.username || 'unknown', status: 'error', message: errorMessage });
                
                errorCount++;
            }

            // Send real-time progress update
            sendProgressUpdate(operationId, {
                type: 'progress',
                current: i + 1,
                total: users.length,
                success: successCount,
                errors: errorCount,
                skipped: skippedCount,
                message: `Processing user ${i + 1} of ${users.length}`
            });

            // Log progress every 10 users to track performance
            if ((i + 1) % 10 === 0) {
                logManager.info('Modify progress', {
                    processed: i + 1,
                    total: users.length,
                    success: successCount,
                    errors: errorCount,
                    skipped: skippedCount
                });
            }
        }

        const duration = Date.now() - startTime;
        
        // Send completion update
        sendProgressUpdate(operationId, {
            type: 'complete',
            current: users.length,
            total: users.length,
            success: successCount,
            errors: errorCount,
            skipped: skippedCount,
            duration: duration,
            message: 'Modify completed'
        });
        
        // Enhanced totals logging
        logManager.info('MODIFY TOTALS - Bulk User Modification Completed', {
            totalRecords: users.length,
            successful: successCount,
            failed: errorCount,
            skipped: skippedCount,
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / users.length) * 100)}%`
        });
        
        // Log structured totals for easy reading
        logManager.logStructured(`MODIFY TOTALS: Total=${users.length}, Modified=${successCount}, Failed=${errorCount}, Skipped=${skippedCount}, Duration=${duration}ms`);
        
        logManager.info('Bulk user modification completed', {
            total: users.length,
            successCount,
            errorCount,
            skippedCount
        });

        res.json({
            success: true,
            results,
            successCount,
            errorCount,
            skippedCount,
            operationId,
            summary: {
                total: users.length,
                successful: successCount,
                failed: errorCount,
                skipped: skippedCount,
                duration: duration
            }
        });

    } catch (error) {
        // Send error update
        sendProgressUpdate(operationId, {
            type: 'error',
            message: error.message,
            error: true
        });

        logManager.error('Bulk user modification error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            error: 'Failed to perform bulk user modification',
            details: error.message,
            operationId
        });
    }
});
// POST /api/modify/by-username - Modify user by username
router.post('/by-username', async (req, res) => {
    try {
        const { username, userData, environmentId, clientId, clientSecret } = req.body;
        
        if (!username || !userData || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: username, userData, environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Modifying user by username', {
            username,
            environmentId,
            fields: Object.keys(userData)
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // First, find the user by username
        const searchResponse = await axios.get(
            `https://api.pingone.com/v1/environments/${environmentId}/users`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    filter: `username eq "${username}"`
                }
            }
        );

        if (!searchResponse.data._embedded?.users?.length) {
            return res.status(404).json({
                error: 'User not found',
                details: `No user found with username: ${username}`
            });
        }

        const user = searchResponse.data._embedded.users[0];
        
        // Modify the user
        const response = await axios.patch(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${user.id}`,
            userData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User modified by username successfully', {
            username,
            userId: user.id,
            environmentId
        });

        res.json({
            success: true,
            userId: user.id,
            user: response.data,
            message: 'User modified successfully'
        });

    } catch (error) {
        logManager.error('Modify user by username error', {
            username: req.body.username,
            error: error.message,
            status: error.response?.status,
            responseData: error.response?.data
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found',
                details: error.response?.data || error.message
            });
        } else if (error.response?.status === 400) {
            res.status(400).json({
                error: 'Invalid user data',
                details: error.response?.data || error.message
            });
        } else {
            res.status(500).json({
                error: 'Failed to modify user',
                details: error.response?.data || error.message
            });
        }
    }
});

// GET /api/modify/user/:userId - Get user details
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { environmentId, clientId, clientSecret } = req.query;
        
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required query parameters: environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Getting user details', {
            userId,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        const response = await axios.get(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            user: response.data
        });

    } catch (error) {
        logManager.error('Get user details error', {
            userId: req.params.userId,
            error: error.message,
            response: error.response?.data
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found'
            });
        } else {
            res.status(500).json({
                error: 'Failed to get user details',
                details: error.message
            });
        }
    }
});

// GET /api/modify/test-totals - Test totals logging (for demonstration)
router.get('/test-totals', (req, res) => {
    const startTime = Date.now();
    
    // Simulate a bulk operation
    const totalRecords = 10;
    const successful = 8;
    const failed = 2;
    const skipped = 0;
    
    const duration = Date.now() - startTime;
    
    // Enhanced totals logging
    logManager.info('MODIFY TOTALS - Test Bulk User Modification Completed', {
        totalRecords: totalRecords,
        successful: successful,
        failed: failed,
        skipped: skipped,
        duration: `${duration}ms`,
        successRate: `${Math.round((successful / totalRecords) * 100)}%`
    });
    
    // Log structured totals for easy reading
    logManager.logStructured(`MODIFY TOTALS: Total=${totalRecords}, Modified=${successful}, Failed=${failed}, Skipped=${skipped}, Duration=${duration}ms`);
    
    res.json({
        success: true,
        message: 'Test totals logging completed',
        summary: {
            total: totalRecords,
            successful: successful,
            failed: failed,
            skipped: skipped,
            duration: duration
        }
    });
});

module.exports = router; 
const express = require('express');
const axios = require('axios');
const logManager = require('../utils/logManager');
const { getWorkerToken, getUserIdByUsername } = require('./token');

const router = express.Router();

// DELETE /api/delete/user/:userId - Delete a specific user
router.delete('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { environmentId, clientId, clientSecret } = req.body;
        
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Deleting user', {
            userId,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        await axios.delete(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User deleted successfully', {
            userId,
            environmentId
        });

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        logManager.error('User deletion error', {
            userId: req.params.userId,
            error: error.message,
            response: error.response?.data
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found'
            });
        } else if (error.response?.status === 403) {
            res.status(403).json({
                error: 'Insufficient permissions to delete user'
            });
        } else {
            res.status(500).json({
                error: 'Failed to delete user',
                details: error.message
            });
        }
    }
});

// POST /api/delete/bulk - Bulk delete users
router.post('/bulk', async (req, res) => {
    try {
        const { userIds, environmentId, clientId, clientSecret } = req.body;
        
        if (!userIds || !Array.isArray(userIds) || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: userIds (array), environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Starting bulk user deletion', {
            userCount: userIds.length,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        const startTime = Date.now();

        for (const userId of userIds) {
            try {
                await axios.delete(
                    `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                results.push({
                    userId,
                    status: 'success',
                    message: 'User deleted successfully'
                });
                
                successCount++;
                
            } catch (error) {
                const errorMessage = error.response?.data?.detail || error.message;
                
                results.push({
                    userId,
                    status: 'error',
                    message: errorMessage
                });
                
                errorCount++;
            }
        }

        const duration = Date.now() - startTime;
        
        // Enhanced totals logging
        logManager.info('DELETE TOTALS - Bulk User Deletion Completed', {
            totalRecords: userIds.length,
            successful: successCount,
            failed: errorCount,
            skipped: 0, // Delete doesn't have skipped records
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / userIds.length) * 100)}%`
        });
        
        // Log structured totals for easy reading
        logManager.logStructured(`DELETE TOTALS: Total=${userIds.length}, Deleted=${successCount}, Failed=${errorCount}, Skipped=0, Duration=${duration}ms`);
        
        logManager.info('Bulk user deletion completed', {
            total: userIds.length,
            successCount,
            errorCount
        });

        res.json({
            success: true,
            results,
            summary: {
                total: userIds.length,
                successful: successCount,
                failed: errorCount
            }
        });

    } catch (error) {
        logManager.error('Bulk user deletion error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            error: 'Failed to perform bulk user deletion',
            details: error.message
        });
    }
});

// POST /api/delete/by-username - Delete user by username
router.post('/by-username', async (req, res) => {
    try {
        const { username, environmentId, clientId, clientSecret } = req.body;
        
        if (!username || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: username, environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Deleting user by username', {
            username,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // First, find the user by username
        logManager.info('Searching for user', {
            username,
            filter: `username eq "${username}"`
        });
        
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

        logManager.info('Search response', {
            username,
            found: searchResponse.data._embedded?.users?.length || 0,
            total: searchResponse.data.count || 0
        });

        if (!searchResponse.data._embedded || !searchResponse.data._embedded.users || searchResponse.data._embedded.users.length === 0) {
            logManager.warn('User not found in search', {
                username,
                responseData: searchResponse.data
            });
            return res.status(404).json({
                error: 'User not found',
                details: `No user found with username: ${username}`
            });
        }

        const user = searchResponse.data._embedded.users[0];
        
        logManager.info('Found user, attempting deletion', {
            username,
            userId: user.id,
            userEmail: user.email
        });
        
        // Delete the user
        await axios.delete(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${user.id}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User deleted by username successfully', {
            username,
            userId: user.id,
            environmentId
        });

        res.json({
            success: true,
            userId: user.id,
            message: 'User deleted successfully'
        });

    } catch (error) {
        logManager.error('Delete user by username error', {
            username: req.body.username,
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            responseData: error.response?.data,
            stack: error.stack
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found',
                details: error.response?.data || error.message
            });
        } else if (error.response?.status === 403) {
            res.status(403).json({
                error: 'Insufficient permissions to delete user',
                details: error.response?.data || error.message
            });
        } else {
            res.status(500).json({
                error: 'Failed to delete user',
                details: error.response?.data || error.message
            });
        }
    }
});

// POST /api/delete/by-email - Delete user by email
router.post('/by-email', async (req, res) => {
    try {
        const { email, environmentId, clientId, clientSecret } = req.body;
        
        if (!email || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: email, environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Deleting user by email', {
            email,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // First, find the user by email
        const searchResponse = await axios.get(
            `https://api.pingone.com/v1/environments/${environmentId}/users`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    filter: `email eq "${email}"`
                }
            }
        );

        if (!searchResponse.data._embedded || !searchResponse.data._embedded.users || searchResponse.data._embedded.users.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const user = searchResponse.data._embedded.users[0];
        
        // Delete the user
        await axios.delete(
            `https://api.pingone.com/v1/environments/${environmentId}/users/${user.id}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User deleted by email successfully', {
            email,
            userId: user.id,
            environmentId
        });

        res.json({
            success: true,
            userId: user.id,
            message: 'User deleted successfully'
        });

    } catch (error) {
        logManager.error('Delete user by email error', {
            email: req.body.email,
            error: error.message,
            response: error.response?.data
        });

        if (error.response?.status === 404) {
            res.status(404).json({
                error: 'User not found'
            });
        } else if (error.response?.status === 403) {
            res.status(403).json({
                error: 'Insufficient permissions to delete user'
            });
        } else {
            res.status(500).json({
                error: 'Failed to delete user',
                details: error.message
            });
        }
    }
});

// Main endpoint for bulk delete, now at /api/delete
router.post('/', async (req, res) => {
    try {
        const { usernames, environmentId, clientId, clientSecret } = req.body;

        if (!usernames || !Array.isArray(usernames) || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: usernames (array), environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Starting bulk user deletion by username', {
            userCount: usernames.length,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        let notFoundCount = 0;
        const startTime = Date.now();

        for (const username of usernames) {
            try {
                // Find the user by username first
                const searchResponse = await axios.get(
                    `https://api.pingone.com/v1/environments/${environmentId}/users?filter=username eq "${username}"`,
                    {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }
                );

                if (searchResponse.data._embedded?.users?.length > 0) {
                    const userId = searchResponse.data._embedded.users[0].id;

                    // Delete the user by ID
                    await axios.delete(
                        `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
                        {
                            headers: { 'Authorization': `Bearer ${token}` }
                        }
                    );

                    results.push({
                        username,
                        status: 'deleted',
                        message: 'User deleted successfully'
                    });
                    successCount++;
                } else {
                    results.push({
                        username,
                        status: 'not_found',
                        message: 'User not found'
                    });
                    notFoundCount++;
                }
            } catch (error) {
                const errorMessage = error.response?.data?.message || error.message;
                results.push({
                    username,
                    status: 'error',
                    message: errorMessage
                });
                errorCount++;
            }
        }

        const duration = Date.now() - startTime;
        logManager.logDeleteOperation(successCount, usernames.length, notFoundCount, duration);

        res.json({
            success: true,
            results,
            summary: {
                total: usernames.length,
                successful: successCount,
                failed: errorCount,
                notFound: notFoundCount
            }
        });

    } catch (error) {
        logManager.error('Bulk user deletion error', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            error: 'Failed to perform bulk user deletion',
            details: error.message
        });
    }
});

// POST /api/delete/user - Delete a single user by username
router.post('/user', async (req, res) => {
    const { username, environmentId, clientId, clientSecret } = req.body;

    if (!username || !environmentId || !clientId || !clientSecret) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    try {
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        const userId = await getUserIdByUsername(username, environmentId, token);

        if (!userId) {
            return res.status(404).json({ success: false, message: `User '${username}' not found.` });
        }

        await deleteUserById(userId, environmentId, token);

        const result = {
            username,
            status: 'deleted',
            message: 'User deleted successfully',
        };

        logManager.info('Single user deleted successfully', { username, userId });
        res.json({ success: true, results: [result] });

    } catch (error) {
        const errorMessage = error.response?.data?.details?.[0]?.message || error.message;
        logManager.error('Failed to delete single user', { username, error: errorMessage });
        res.status(500).json({ success: false, message: errorMessage });
    }
});

module.exports = router; 
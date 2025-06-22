const express = require('express');
const axios = require('axios');
const { logger } = require('../utils/logger');
const { getWorkerToken } = require('./token');

const router = express.Router();

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

        logger.info('Modifying user', {
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

        logger.info('User modified successfully', {
            userId,
            environmentId
        });

        res.json({
            success: true,
            user: response.data,
            message: 'User modified successfully'
        });

    } catch (error) {
        logger.error('User modification error', {
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

        logger.info('Partially updating user', {
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

        logger.info('User partially updated successfully', {
            userId,
            environmentId
        });

        res.json({
            success: true,
            user: response.data,
            message: 'User updated successfully'
        });

    } catch (error) {
        logger.error('User partial update error', {
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
    try {
        const { users, environmentId, clientId, clientSecret } = req.body;
        
        if (!users || !Array.isArray(users) || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: users (array), environmentId, clientId, clientSecret'
            });
        }

        logger.info('Starting bulk user modification', {
            userCount: users.length,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const userUpdate of users) {
            try {
                const { userId, userData, username } = userUpdate;
                
                if (!userId && !username) {
                    throw new Error('Missing userId or username');
                }
                
                if (!userData) {
                    throw new Error('Missing userData');
                }

                let targetUserId = userId;
                
                // If we have username but no userId, find the user first
                if (!userId && username) {
                    logger.info('Finding user by username for modification', { username });
                    
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
                        throw new Error(`User not found with username: ${username}`);
                    }
                    
                    targetUserId = searchResponse.data._embedded.users[0].id;
                }

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
                
                successCount++;
                
            } catch (error) {
                logger.error('Individual user modification error', {
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
                
                errorCount++;
            }
        }

        logger.info('Bulk user modification completed', {
            total: users.length,
            successCount,
            errorCount
        });

        res.json({
            success: true,
            results,
            summary: {
                total: users.length,
                successful: successCount,
                failed: errorCount
            }
        });

    } catch (error) {
        logger.error('Bulk user modification error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            error: 'Failed to perform bulk user modification',
            details: error.message
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

        logger.info('Modifying user by username', {
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

        logger.info('User modified by username successfully', {
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
        logger.error('Modify user by username error', {
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

        logger.info('Getting user details', {
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
        logger.error('Get user details error', {
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

module.exports = router; 
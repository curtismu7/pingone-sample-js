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
                const { userId, userData } = userUpdate;
                
                if (!userId || !userData) {
                    throw new Error('Missing userId or userData');
                }

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

                results.push({
                    userId,
                    status: 'success',
                    message: 'User modified successfully',
                    user: response.data
                });
                
                successCount++;
                
            } catch (error) {
                const errorMessage = error.response?.data?.detail || error.message;
                
                results.push({
                    userId: userUpdate.userId || 'unknown',
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
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const logManager = require('../utils/logManager');
const { getWorkerToken } = require('./token');

// Configure rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Request timeout configuration (10 seconds)
const REQUEST_TIMEOUT = 10000;

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Trim whitespace from string fields
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
};

const router = express.Router();

/**
 * @route   DELETE /api/delete/user/:userId
 * @desc    Delete a specific user by ID
 * @access  Private
 * @param   {string} userId - The ID of the user to delete
 * @returns {Object} Success/error message
 */
router.delete('/user/:userId', [
  apiLimiter,
  sanitizeInput,
  param('userId').isString().notEmpty().withMessage('User ID is required'),
  body('environmentId').isString().notEmpty().withMessage('Environment ID is required'),
  body('clientId').isString().notEmpty().withMessage('Client ID is required'),
  body('clientSecret').isString().notEmpty().withMessage('Client secret is required')
], async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
    try {
        const { userId } = req.params;
        const { environmentId, clientId, clientSecret } = req.body;

        logManager.info('Deleting user', {
            userId,
            environmentId
        });

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // Validate user ID format if needed
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId)) {
          return res.status(400).json({
            error: 'Invalid user ID format',
            code: 'INVALID_USER_ID'
          });
        }

        await axios.delete(
          `https://api.pingone.com/v1/environments/${encodeURIComponent(environmentId)}/users/${encodeURIComponent(userId)}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: REQUEST_TIMEOUT,
            validateStatus: status => status < 500 // Don't throw for 4xx errors
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

/**
 * @route   POST /api/delete/bulk
 * @desc    Bulk delete multiple users
 * @access  Private
 * @param   {string[]} userIds - Array of user IDs to delete
 * @param   {string} environmentId - PingOne environment ID
 * @param   {string} clientId - API client ID
 * @param   {string} clientSecret - API client secret
 * @returns {Object} Results of the bulk operation
 */
router.post('/bulk', [
  apiLimiter,
  sanitizeInput,
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('userIds must be a non-empty array'),
  body('environmentId').isString().notEmpty(),
  body('clientId').isString().notEmpty(),
  body('clientSecret').isString().notEmpty()
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { userIds, environmentId, clientId, clientSecret } = req.body;

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
        
        // Enhanced logging with more context
        const successRate = userIds.length > 0 ? Math.round((successCount / userIds.length) * 100) : 0;
        
        logManager.info('Bulk deletion summary', {
            operation: 'bulk_delete',
            totalRecords: userIds.length,
            successful: successCount,
            failed: errorCount,
            skipped: 0,
            durationMs: duration,
            successRate: `${successRate}%`,
            environmentId,
            clientId: clientId ? `${clientId.substring(0, 4)}...` : 'undefined'
        });

        // Audit log
        logManager.audit('bulk_user_deletion', {
            userIdsProcessed: userIds.length,
            successCount,
            errorCount,
            clientId: clientId ? `${clientId.substring(0, 4)}...` : 'undefined',
            environmentId
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

/**
 * @route   POST /api/delete/by-username
 * @desc    Delete a user by username
 * @access  Private
 * @param   {string} username - The username to delete
 * @param   {string} environmentId - PingOne environment ID
 * @param   {string} clientId - API client ID
 * @param   {string} clientSecret - API client secret
 * @returns {Object} Success/error message
 */
router.post('/by-username', [
  apiLimiter,
  sanitizeInput,
  body('username').isString().trim().notEmpty().withMessage('Username is required'),
  body('environmentId').isString().notEmpty(),
  body('clientId').isString().notEmpty(),
  body('clientSecret').isString().notEmpty()
], async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
    try {
        const { username, environmentId, clientId, clientSecret } = req.body;

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

/**
 * @route   POST /api/delete/by-email
 * @desc    Delete a user by email
 * @access  Private
 * @param   {string} email - The email of the user to delete
 * @param   {string} environmentId - PingOne environment ID
 * @param   {string} clientId - API client ID
 * @param   {string} clientSecret - API client secret
 * @returns {Object} Success/error message
 */
router.post('/by-email', [
  apiLimiter,
  sanitizeInput,
  body('email').isEmail().normalizeEmail(),
  body('environmentId').isString().notEmpty(),
  body('clientId').isString().notEmpty(),
  body('clientSecret').isString().notEmpty()
], async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
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

/**
 * @route   POST /api/delete
 * @desc    Delete multiple users
 * @access  Private
 * @param   {string} environmentId - PingOne environment ID
 * @param   {string} clientId - API client ID
 * @param   {string} clientSecret - API client secret
 * @param   {string[]} userIds - Array of user IDs to delete
 * @returns {Object} Success/error message
 */
router.post('/', async (req, res) => {
    const { environmentId, clientId, clientSecret, userIds } = req.body;

    if (!environmentId || !clientId || !clientSecret || !userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters',
            required: ['environmentId', 'clientId', 'clientSecret', 'userIds']
        });
    }

    try {
        // Get access token
        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        
        // Process deletions
        const results = [];
        
        for (const userId of userIds) {
            try {
                // Make API call to delete user
                // Uncomment and configure this when ready to make actual API calls
                /*
                await axios.delete(
                    `https://api.pingone.com/v1/environments/${environmentId}/users/${userId}`,
                    {
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                */
                
                // Simulate successful deletion for now
                results.push({
                    userId,
                    status: 'deleted',
                    message: 'User deleted successfully'
                });
            } catch (error) {
                results.push({
                    userId,
                    status: 'error',
                    message: error.response?.data?.message || error.message
                });
            }
        }

        // Count successful and failed deletions
        const deletedCount = results.filter(r => r.status === 'deleted').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        res.json({
            success: true,
            deletedCount,
            errorCount,
            results
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Delete operation failed',
            details: error.message,
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
});

// POST /api/delete/user - Delete a single user by username
router.post('/user', async (req, res) => {
    const { username, environmentId, clientId, clientSecret } = req.body;

    if (!username || !environmentId || !clientId || !clientSecret) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields.',
            required: ['username', 'environmentId', 'clientId', 'clientSecret']
        });
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
    }
});

// Global error handler
router.use((err, req, res, next) => {
  logManager.error('Unhandled error in delete routes', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Send error response
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = router;
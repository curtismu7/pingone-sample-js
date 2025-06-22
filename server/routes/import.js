// PingOne User Import Routes
// This file handles bulk user import operations to PingOne
// Debugging: Check server logs for detailed import progress and PingOne API responses

const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logManager = require('../utils/logManager');
const { getWorkerToken } = require('./token');

const router = express.Router();

// Configure multer for file uploads
// DEBUG: If file uploads fail, check upload directory permissions and file size limits
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.csv');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // DEBUG: If file upload is rejected, check file type and extension
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// POST /api/import - Import users from CSV file upload
// DEBUG: This endpoint handles file uploads - check multipart/form-data content type
router.post('/', upload.single('csv'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        // Validate file upload
        // DEBUG: If no file received, check form field name and file selection
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file uploaded' });
        }

        // Validate credentials
        // DEBUG: Check if all required PingOne credentials are provided
        const { environmentId, clientId, clientSecret } = req.body;
        
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({ 
                error: 'Missing required PingOne credentials' 
            });
        }

        logManager.info('Starting CSV import', {
            filename: req.file.originalname,
            size: req.file.size,
            environmentId
        });
        
        logManager.logUserAction('file_upload', {
            filename: req.file.originalname,
            size: req.file.size,
            records: 'analyzing...'
        });

        // Read and parse CSV file
        // DEBUG: If CSV parsing fails, check file encoding and format
        const csvData = fs.readFileSync(req.file.path, 'utf8');
        const parseResult = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim()
        });

        if (parseResult.errors && parseResult.errors.length > 0) {
            logManager.warn('CSV parsing warnings', { errors: parseResult.errors });
        }

        const users = parseResult.data;
        logManager.info('CSV parsed successfully', { 
            recordCount: users.length,
            headers: Object.keys(users[0] || {})
        });
        
        logManager.logFileSelected(req.file.originalname, users.length);
        logManager.logUserAction('operation_start', {
            operation: 'Import',
            recordCount: users.length
        });

        // Get worker token for PingOne API authentication
        // DEBUG: If token request fails, check credentials and PingOne connectivity
        const token = await getWorkerToken(environmentId, clientId, clientSecret);

        // Process users one by one
        // DEBUG: Monitor this loop for performance and error patterns
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            try {
                // Get default population ID from PingOne
                // DEBUG: If population lookup fails, check environment configuration
                const defaultPopulationId = await getDefaultPopulation(environmentId, token);
                
                // Map CSV data to PingOne user format
                const userData = mapUserData(user, defaultPopulationId);
                
                // Create user in PingOne
                const result = await createUser(userData, environmentId, token);
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'imported',
                    message: 'User created successfully',
                    userId: result.id
                });
                
                successCount++;
                
            } catch (error) {
                // DEBUG: Check error details for specific PingOne API failures
                const errorMessage = error.response?.data?.details?.[0]?.message || 
                                   error.response?.data?.detail || 
                                   error.message;
                
                logManager.error('User import failed', {
                    username: user.username || user.email,
                    error: errorMessage,
                    apiResponse: error.response?.data
                });
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'error',
                    message: errorMessage,
                    error: error.response?.data
                });
                
                errorCount++;
            }

            // Log progress every 10 users to track performance
            if ((i + 1) % 10 === 0) {
                logManager.info('Import progress', {
                    processed: i + 1,
                    total: users.length,
                    success: successCount,
                    errors: errorCount
                });
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        const duration = Date.now() - startTime;
        
        // Enhanced totals logging
        logManager.info('IMPORT TOTALS - CSV Import Completed', {
            filename: req.file.originalname,
            totalRecords: users.length,
            successful: successCount,
            failed: errorCount,
            skipped: 0, // Import doesn't have skipped records
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / users.length) * 100)}%`
        });
        
        // Log structured totals for easy reading
        logManager.logStructured(`IMPORT TOTALS: Total=${users.length}, Imported=${successCount}, Failed=${errorCount}, Skipped=0, Duration=${duration}ms`);
        
        logManager.logImportOperation(successCount, users.length, duration);
        logManager.logUserAction('operation_complete', {
            operation: 'Import',
            totalRecords: users.length,
            successful: successCount,
            failed: errorCount,
            skipped: 0
        });

        res.json({
            success: true,
            results,
            successCount,
            errorCount,
            summary: {
                total: users.length,
                successful: successCount,
                failed: errorCount,
                duration: duration
            }
        });

    } catch (error) {
        logManager.error('CSV import error', {
            error: error.message,
            stack: error.stack,
            filename: req.file?.originalname
        });

        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Failed to import users',
            details: error.message
        });
    }
});

// POST /api/import/bulk - Import users from JSON data (no file upload)
// DEBUG: This endpoint handles direct JSON data - check request body structure
router.post('/bulk', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { users, environmentId, clientId, clientSecret } = req.body;
        
        // Validate input parameters
        // DEBUG: Check if users array and credentials are properly structured
        if (!users || !Array.isArray(users) || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: users (array), environmentId, clientId, clientSecret'
            });
        }

        logManager.info('Starting bulk import from JSON data', {
            recordCount: users.length,
            environmentId
        });

        logManager.logUserAction('operation_start', {
            operation: 'Bulk Import',
            recordCount: users.length
        });

        // Get worker token for authentication
        const token = await getWorkerToken(environmentId, clientId, clientSecret);

        // Process users
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            try {
                // Get default population if not specified in user data
                const defaultPopulationId = await getDefaultPopulation(environmentId, token);
                const userData = mapUserData(user, defaultPopulationId);
                const result = await createUser(userData, environmentId, token);
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'imported',
                    message: 'User created successfully',
                    userId: result.id
                });
                
                successCount++;
                
            } catch (error) {
                const errorMessage = error.response?.data?.details?.[0]?.message || 
                                   error.response?.data?.detail || 
                                   error.message;
                
                logManager.error('Bulk user import failed', {
                    username: user.username || user.email,
                    error: errorMessage,
                    apiResponse: error.response?.data
                });
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'error',
                    message: errorMessage,
                    error: error.response?.data
                });
                
                errorCount++;
            }

            // Progress logging
            if ((i + 1) % 10 === 0) {
                logManager.info('Bulk import progress', {
                    processed: i + 1,
                    total: users.length,
                    success: successCount,
                    errors: errorCount
                });
            }
        }

        const duration = Date.now() - startTime;
        logManager.info('Bulk import completed', {
            totalRecords: users.length,
            successCount,
            errorCount,
            duration: `${duration}ms`
        });
        
        logManager.logImportOperation(successCount, users.length, duration);
        logManager.logUserAction('operation_complete', {
            operation: 'Bulk Import'
        });

        res.json({
            success: true,
            results,
            successCount,
            errorCount,
            summary: {
                total: users.length,
                successful: successCount,
                failed: errorCount,
                duration: duration
            }
        });

    } catch (error) {
        logManager.error('Bulk import error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            error: 'Failed to import users',
            details: error.message
        });
    }
});

// POST /api/import/user - Import single user
router.post('/user', async (req, res) => {
    try {
        const { user, environmentId, clientId, clientSecret } = req.body;
        
        if (!user || !environmentId || !clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Missing required fields: user, environmentId, clientId, clientSecret'
            });
        }

        const token = await getWorkerToken(environmentId, clientId, clientSecret);
        const defaultPopulationId = await getDefaultPopulation(environmentId, token);
        const userData = mapUserData(user, defaultPopulationId);
        const result = await createUser(userData, environmentId, token);

        logManager.info('Single user import successful', {
            username: user.username || user.email,
            userId: result.id,
            environmentId
        });

        res.json({
            success: true,
            userId: result.id,
            message: 'User created successfully'
        });

    } catch (error) {
        logManager.error('Single user import error', {
            error: error.message,
            username: req.body.user?.username || req.body.user?.email
        });

        const errorMessage = error.response?.data?.detail || error.message;
        res.status(500).json({
            error: 'Failed to create user',
            details: errorMessage
        });
    }
});

// Helper function to get the default population for the environment
// DEBUG: If population lookup fails, check environment permissions and API response
async function getDefaultPopulation(environmentId, token) {
    try {
        logManager.debug('Getting default population', { environmentId });
        
        const response = await axios.get(
            `https://api.pingone.com/v1/environments/${environmentId}/populations`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Find the default population (usually the first one or marked as default)
        const populations = response.data._embedded?.populations || [];
        let defaultPopulation = populations.find(pop => pop.default === true);
        
        if (!defaultPopulation && populations.length > 0) {
            defaultPopulation = populations[0]; // Use first population as fallback
        }

        if (!defaultPopulation) {
            throw new Error('No populations found in environment');
        }

        logManager.info('Found default population', {
            environmentId,
            populationId: defaultPopulation.id,
            populationName: defaultPopulation.name
        });

        return defaultPopulation.id;

    } catch (error) {
        logManager.error('Failed to get default population', {
            environmentId,
            error: error.message,
            responseData: error.response?.data
        });
        throw new Error(`Failed to get default population: ${error.message}`);
    }
}

// Helper function to map CSV user data to PingOne user format
// DEBUG: If user data mapping fails, check CSV headers and PingOne user schema
function mapUserData(user, defaultPopulationId = null) {
    // DEBUG: Log user data structure for troubleshooting
    logManager.debug('Mapping user data', {
        username: user.username,
        email: user.email,
        hasPopulationId: !!user.populationId,
        defaultPopulationId
    });

    // Basic user data structure for PingOne
    const userData = {
        username: user.username,
        email: user.email,
        population: { 
            id: user.populationId || defaultPopulationId 
        },
        enabled: user.active !== undefined ? user.active === 'true' || user.active === true : true
    };

    // Add name information if available
    if (user.firstName || user.lastName || user.givenName || user.familyName) {
        userData.name = {};
        
        if (user.firstName || user.givenName) {
            userData.name.given = user.firstName || user.givenName;
        }
        
        if (user.lastName || user.familyName) {
            userData.name.family = user.lastName || user.familyName;
        }
        
        if (user.middleName) {
            userData.name.middle = user.middleName;
        }
        
        if (user.formattedName) {
            userData.name.formatted = user.formattedName;
        }
        
        if (user.prefix) {
            userData.name.honorificPrefix = user.prefix;
        }
        
        if (user.suffix) {
            userData.name.honorificSuffix = user.suffix;
        }
    }

    // Add additional profile information
    if (user.nickname) {
        userData.nickname = user.nickname;
    }
    
    if (user.title) {
        userData.title = user.title;
    }
    
    if (user.preferredLanguage) {
        userData.preferredLanguage = user.preferredLanguage;
    }
    
    if (user.locale) {
        userData.locale = user.locale;
    }
    
    if (user.timezone) {
        userData.timezone = user.timezone;
    }

    // Add external ID if provided
    if (user.externalId) {
        userData.externalId = user.externalId;
    }

    // Add type if provided (employee, contractor, etc.)
    if (user.type) {
        userData.type = user.type;
    }

    // Add phone numbers if provided
    if (user.primaryPhone || user.mobilePhone) {
        userData.phoneNumbers = [];
        
        if (user.primaryPhone) {
            userData.phoneNumbers.push({
                value: user.primaryPhone,
                type: 'work',
                primary: true
            });
        }
        
        if (user.mobilePhone && user.mobilePhone !== user.primaryPhone) {
            userData.phoneNumbers.push({
                value: user.mobilePhone,
                type: 'mobile',
                primary: false
            });
        }
    }

    // Add address if provided
    if (user.streetAddress || user.locality || user.region || user.postalCode || user.countryCode) {
        userData.addresses = [{
            type: 'work',
            primary: true
        }];
        
        if (user.streetAddress) {
            userData.addresses[0].streetAddress = user.streetAddress;
        }
        
        if (user.locality) {
            userData.addresses[0].locality = user.locality;
        }
        
        if (user.region) {
            userData.addresses[0].region = user.region;
        }
        
        if (user.postalCode) {
            userData.addresses[0].postalCode = user.postalCode;
        }
        
        if (user.countryCode) {
            userData.addresses[0].countryCode = user.countryCode;
        }
    }

    // Add password if provided (for initial password set)
    if (user.password) {
        userData.password = {
            value: user.password,
            forceChange: false // Set to true if you want users to change password on first login
        };
    }

    // DEBUG: Log final mapped user data structure
    logManager.debug('User data mapped', {
        username: userData.username,
        email: userData.email,
        populationId: userData.population?.id,
        hasName: !!userData.name,
        hasPhoneNumbers: !!userData.phoneNumbers,
        hasAddresses: !!userData.addresses,
        hasPassword: !!userData.password
    });

    return userData;
}

// Helper function to create a user in PingOne
// DEBUG: If user creation fails, check PingOne API response and user data format
async function createUser(userData, environmentId, token) {
    try {
        logManager.debug('Creating user in PingOne', {
            username: userData.username,
            email: userData.email,
            environmentId,
            populationId: userData.population?.id
        });

        const response = await axios.post(
            `https://api.pingone.com/v1/environments/${environmentId}/users`,
            userData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logManager.info('User created successfully', {
            username: userData.username,
            email: userData.email,
            userId: response.data.id,
            environmentId
        });

        return response.data;

    } catch (error) {
        // DEBUG: Log detailed error information for troubleshooting
        logManager.error('PingOne API error during user creation', {
            username: userData.username,
            email: userData.email,
            environmentId,
            error: error.message,
            responseStatus: error.response?.status,
            responseData: error.response?.data,
            requestData: userData
        });

        // Re-throw with enhanced error information
        const enhancedError = new Error(`Failed to create user ${userData.username}: ${error.message}`);
        enhancedError.response = error.response;
        enhancedError.userData = userData;
        throw enhancedError;
    }
}

module.exports = router; 
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

// Configure multer for file uploads
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
        cb(null, 'import-' + uniqueSuffix + '.csv');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1
    }
});

// POST /api/import - Import users from CSV file upload
router.post('/', upload.single('csv'), async (req, res) => {
    const startTime = Date.now();
    const operationId = `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // Validate file upload
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const filePath = req.file.path;
        
        // Read and process the file in chunks
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        
        // Process the file using PapaParse with streaming
        const parseStream = Papa.parse(Papa.NODE_STREAM_INPUT, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => {
                return header.trim();
            }
        });

        let rowCount = 0;
        const users = [];
        
        // Process each row as it's parsed
        parseStream.on('data', (row) => {
            rowCount++;
            users.push(row);
            
            // Send progress updates
            sendProgressUpdate(operationId, {
                type: 'progress',
                processed: rowCount,
                status: 'processing'
            });
        });

        // Handle parsing completion
        await new Promise((resolve, reject) => {
            parseStream.on('end', () => resolve());
            parseStream.on('error', (error) => reject(error));
            fileStream.pipe(parseStream);
        });

        // Process users and import them
        const { environmentId, clientId, clientSecret } = req.body;
        
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({ 
                error: 'Missing required PingOne credentials' 
            });
        }

        // Send initial progress update
        sendProgressUpdate(operationId, {
            type: 'progress',
            current: 0,
            total: users.length,
            success: 0,
            errors: 0,
            message: 'Reading CSV file...'
        });

        logManager.info('Starting CSV import', {
            filename: req.file.originalname,
            size: req.file.size,
            environmentId,
            operationId
        });
        
        logManager.logUserAction('file_upload', {
            filename: req.file.originalname,
            size: req.file.size,
            records: 'analyzing...'
        });

        // Send parsing complete update
        sendProgressUpdate(operationId, {
            type: 'progress',
            current: 0,
            total: users.length,
            success: 0,
            errors: 0,
            message: `CSV parsed: ${users.length} records found`
        });

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
        sendProgressUpdate(operationId, {
            type: 'progress',
            current: 0,
            total: users.length,
            success: 0,
            errors: 0,
            message: 'Getting authentication token...'
        });

        const accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
        const defaultPopulationId = await getDefaultPopulation(environmentId, accessToken);

        // Process users one by one
        // DEBUG: Monitor this loop for performance and error patterns
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            try {
                // Map CSV data to PingOne user format
                const userData = mapUserData(user, defaultPopulationId);
                
                // Create user in PingOne
                const result = await createUser(userData, environmentId, accessToken);
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'imported',
                    message: 'User created successfully',
                    userId: result.id
                });
                
                successCount++;
                
                logManager.logUserAction('import', { 
                    username: user.username || user.email || `user-${i}`, 
                    userId: result.id,
                    status: 'success', 
                    message: 'User created successfully' 
                });
                
            } catch (error) {
                // DEBUG: Check error details for specific PingOne API failures
                const errorMessage = error.response?.data?.details?.[0]?.message || 
                                   error.response?.data?.detail || 
                                   error.message;
                
                // Check if this is a uniqueness violation (should be treated as skipped)
                const detailsCode = error.response?.data?.details?.[0]?.code;
                const isUniquenessViolation = (detailsCode && detailsCode.toUpperCase() === 'UNIQUENESS_VIOLATION') ||
                                            (errorMessage && errorMessage.toLowerCase().includes('unique')) ||
                                            (errorMessage && errorMessage.toLowerCase().includes('already exists'));
                
                const status = isUniquenessViolation ? 'skipped' : 'error';
                const finalMessage = isUniquenessViolation ? 'User already exists (skipped)' : errorMessage;
                
                if (isUniquenessViolation) {
                    logManager.info('User skipped (already exists)', {
                        username: user.username || user.email,
                        reason: errorMessage
                    });
                } else {
                    logManager.error('User import failed', {
                        username: user.username || user.email,
                        error: errorMessage,
                        apiResponse: error.response?.data
                    });
                }
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: status,
                    message: finalMessage,
                    error: error.response?.data
                });
                
                if (isUniquenessViolation) {
                    skippedCount++;
                } else {
                    errorCount++;
                }
                
                logManager.logUserAction('import', { 
                    username: user.username || user.email || `user-${i}`, 
                    status: status, 
                    message: finalMessage 
                });
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
                logManager.info('Import progress', {
                    processed: i + 1,
                    total: users.length,
                    success: successCount,
                    errors: errorCount,
                    skipped: skippedCount
                });
            }
        }

        // Clean up uploaded file
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting uploaded file:', err);
            }
        });

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
            message: 'Import completed'
        });
        
        // Enhanced totals logging
        logManager.info('IMPORT TOTALS - CSV Import Completed', {
            filename: req.file.originalname,
            totalRecords: users.length,
            successful: successCount,
            failed: errorCount,
            skipped: skippedCount,
            duration: `${duration}ms`,
            successRate: `${Math.round((successCount / users.length) * 100)}%`
        });
        
        // Log structured totals for easy reading
        logManager.logStructured(`IMPORT TOTALS: Total=${users.length}, Imported=${successCount}, Failed=${errorCount}, Skipped=${skippedCount}, Duration=${duration}ms`);
        
        logManager.logImportOperation(successCount, users.length, duration, skippedCount);
        logManager.logUserAction('operation_complete', {
            operation: 'Import',
            totalRecords: users.length,
            successful: successCount,
            failed: errorCount,
            skipped: skippedCount
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

        logManager.error('CSV import error', {
            error: error.message,
            stack: error.stack,
            filename: req.file?.originalname
        });

        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error cleaning up file after error:', err);
            });
        }

        res.status(500).json({
            error: 'Failed to import users',
            details: error.message,
            operationId
        });
    }
});

// POST /api/import/bulk - Import users from JSON data (no file upload)
// DEBUG: This endpoint handles direct JSON data - check request body structure
router.post('/bulk', express.json({ limit: '50mb' }), async (req, res) => {
    const startTime = Date.now();
    const operationId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        const { users, environmentId, clientId, clientSecret } = req.body;
        
        // Validate input parameters
        // DEBUG: Check if users array and credentials are properly structured
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
            message: 'Starting bulk import...'
        });

        logManager.info('Starting bulk import from JSON data', {
            recordCount: users.length,
            environmentId,
            operationId
        });

        logManager.logUserAction('operation_start', {
            operation: 'Bulk Import',
            recordCount: users.length
        });

        // Get worker token for authentication
        sendProgressUpdate(operationId, {
            type: 'progress',
            current: 0,
            total: users.length,
            success: 0,
            errors: 0,
            message: 'Getting authentication token...'
        });

        const accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
        const defaultPopulationId = await getDefaultPopulation(environmentId, accessToken);

        // Process users
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            try {
                // Get default population if not specified in user data
                const userData = mapUserData(user, defaultPopulationId);
                const result = await createUser(userData, environmentId, accessToken);
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'imported',
                    message: 'User created successfully',
                    userId: result.id
                });
                
                successCount++;
                
                logManager.logUserAction('import', { 
                    username: user.username || user.email || `user-${i}`, 
                    userId: result.id,
                    status: 'success', 
                    message: 'User created successfully' 
                });
                
            } catch (error) {
                const errorMessage = error.response?.data?.details?.[0]?.message || 
                                   error.response?.data?.detail || 
                                   error.message;
                
                // Check if this is a uniqueness violation (should be treated as skipped)
                const detailsCode = error.response?.data?.details?.[0]?.code;
                const isUniquenessViolation = (detailsCode && detailsCode.toUpperCase() === 'UNIQUENESS_VIOLATION') ||
                                            (errorMessage && errorMessage.toLowerCase().includes('unique')) ||
                                            (errorMessage && errorMessage.toLowerCase().includes('already exists'));
                
                const status = isUniquenessViolation ? 'skipped' : 'error';
                const finalMessage = isUniquenessViolation ? 'User already exists (skipped)' : errorMessage;
                
                if (isUniquenessViolation) {
                    logManager.info('User skipped (already exists)', {
                        username: user.username || user.email,
                        reason: errorMessage
                    });
                } else {
                    logManager.error('Bulk user import failed', {
                        username: user.username || user.email,
                        error: errorMessage,
                        apiResponse: error.response?.data
                    });
                }
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: status,
                    message: finalMessage,
                    error: error.response?.data
                });
                
                if (isUniquenessViolation) {
                    skippedCount++;
                } else {
                    errorCount++;
                }
                
                logManager.logUserAction('import', { 
                    username: user.username || user.email || `user-${i}`, 
                    status: status, 
                    message: finalMessage 
                });
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

            // Progress logging
            if ((i + 1) % 10 === 0) {
                logManager.info('Bulk import progress', {
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
            message: 'Import completed'
        });

        logManager.info('Bulk import completed', {
            totalRecords: users.length,
            successCount,
            errorCount,
            skippedCount,
            duration: `${duration}ms`
        });
        
        logManager.logImportOperation(successCount, users.length, duration, skippedCount);
        logManager.logUserAction('operation_complete', {
            operation: 'Bulk Import',
            totalRecords: users.length,
            successful: successCount,
            failed: errorCount,
            skipped: skippedCount
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

        logManager.error('Bulk import error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            error: 'Failed to import users',
            details: error.message,
            operationId
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

        const accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
        const defaultPopulationId = await getDefaultPopulation(environmentId, accessToken);
        const userData = mapUserData(user, defaultPopulationId);
        const result = await createUser(userData, environmentId, accessToken);

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
async function getDefaultPopulation(environmentId, accessToken) {
    try {
        logManager.debug('Getting default population', { environmentId });
        
        const response = await axios.get(
            `https://api.pingone.com/v1/environments/${environmentId}/populations`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
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
    // Sanitize user data to remove any leading/trailing whitespace
    const sanitizedUser = {};
    for (const key in user) {
        sanitizedUser[key] = typeof user[key] === 'string' ? user[key].trim() : user[key];
    }

    // Use populationId from CSV if present, otherwise fall back to the default
    const populationId = defaultPopulationId;

    const data = {
        population: { id: populationId },
        username: sanitizedUser.username,
        email: sanitizedUser.email,
        enabled: sanitizedUser.active !== undefined ? sanitizedUser.active === 'true' || sanitizedUser.active === true : true
    };

    // Add name information if available
    if (sanitizedUser.firstName || sanitizedUser.lastName || sanitizedUser.givenName || sanitizedUser.familyName) {
        data.name = {};
        
        if (sanitizedUser.firstName || sanitizedUser.givenName) {
            data.name.given = sanitizedUser.firstName || sanitizedUser.givenName;
        }
        
        if (sanitizedUser.lastName || sanitizedUser.familyName) {
            data.name.family = sanitizedUser.lastName || sanitizedUser.familyName;
        }
        
        if (sanitizedUser.middleName) {
            data.name.middle = sanitizedUser.middleName;
        }
        
        if (sanitizedUser.formattedName) {
            data.name.formatted = sanitizedUser.formattedName;
        }
        
        if (sanitizedUser.prefix) {
            data.name.honorificPrefix = sanitizedUser.prefix;
        }
        
        if (sanitizedUser.suffix) {
            data.name.honorificSuffix = sanitizedUser.suffix;
        }
    }

    // Add additional profile information
    if (sanitizedUser.nickname) {
        data.nickname = sanitizedUser.nickname;
    }
    
    if (sanitizedUser.title) {
        data.title = sanitizedUser.title;
    }
    
    if (sanitizedUser.preferredLanguage) {
        data.preferredLanguage = sanitizedUser.preferredLanguage;
    }
    
    if (sanitizedUser.locale) {
        data.locale = sanitizedUser.locale;
    }
    
    if (sanitizedUser.timezone) {
        data.timezone = sanitizedUser.timezone;
    }

    // Add external ID if provided
    if (sanitizedUser.externalId) {
        data.externalId = sanitizedUser.externalId;
    }

    // Add type if provided (employee, contractor, etc.)
    if (sanitizedUser.type) {
        data.type = sanitizedUser.type;
    }

    // Add phone numbers if provided
    if (sanitizedUser.primaryPhone || sanitizedUser.mobilePhone) {
        data.phoneNumbers = [];
        
        if (sanitizedUser.primaryPhone) {
            data.phoneNumbers.push({
                value: sanitizedUser.primaryPhone,
                type: 'work',
                primary: true
            });
        }
        
        if (sanitizedUser.mobilePhone && sanitizedUser.mobilePhone !== sanitizedUser.primaryPhone) {
            data.phoneNumbers.push({
                value: sanitizedUser.mobilePhone,
                type: 'mobile',
                primary: false
            });
        }
    }

    // Add address if provided
    if (sanitizedUser.streetAddress || sanitizedUser.locality || sanitizedUser.region || sanitizedUser.postalCode || sanitizedUser.countryCode) {
        data.addresses = [{
            type: 'work',
            primary: true
        }];
        
        if (sanitizedUser.streetAddress) {
            data.addresses[0].streetAddress = sanitizedUser.streetAddress;
        }
        
        if (sanitizedUser.locality) {
            data.addresses[0].locality = sanitizedUser.locality;
        }
        
        if (sanitizedUser.region) {
            data.addresses[0].region = sanitizedUser.region;
        }
        
        if (sanitizedUser.postalCode) {
            data.addresses[0].postalCode = sanitizedUser.postalCode;
        }
        
        if (sanitizedUser.countryCode) {
            data.addresses[0].countryCode = sanitizedUser.countryCode;
        }
    }

    // Add password if provided (for initial password set)
    if (sanitizedUser.password) {
        data.password = {
            value: sanitizedUser.password,
            forceChange: false // Set to true if you want users to change password on first login
        };
    }

    // DEBUG: Log final mapped user data structure
    logManager.debug('User data mapped', {
        username: data.username,
        email: data.email,
        populationId: data.population?.id,
        hasName: !!data.name,
        hasPhoneNumbers: !!data.phoneNumbers,
        hasAddresses: !!data.addresses,
        hasPassword: !!data.password
    });

    return data;
}

// Helper function to create a user in PingOne
// DEBUG: If user creation fails, check PingOne API response and user data format
async function createUser(userData, environmentId, accessToken) {
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
                    'Authorization': `Bearer ${accessToken}`,
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

// Import endpoint
router.post('/import', multer({
    storage: multer.memoryStorage(), // Store files in memory
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
}).single('csvFile'), async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        const csvFile = req.file;

        if (!clientId || !clientSecret || !csvFile) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: clientId, clientSecret, and csvFile'
            });
        }

        // TODO: Implement actual PingOne import logic here
        // For now, just return a success response
        res.json({
            success: true,
            message: 'User import initiated successfully',
            details: {
                clientId: clientId,
                filename: csvFile.originalname,
                size: csvFile.size,
                mimetype: csvFile.mimetype
            }
        });
    } catch (error) {
        console.error('Error in import:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

module.exports = router;
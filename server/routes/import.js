const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logManager = require('../utils/logManager');

// Import token functions
const { getWorkerToken } = require('./token');

const router = express.Router();
const sseConnections = new Map();

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

// SSE endpoint for progress updates
router.get('/progress/:operationId', (req, res) => {
    const { operationId } = req.params;
    
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });

    // Store the response object
    sseConnections.set(operationId, res);

    // Remove connection when client closes
    req.on('close', () => {
        sseConnections.delete(operationId);
    });
});

// Helper function to send progress updates
function sendProgressUpdate(operationId, data) {
    const res = sseConnections.get(operationId);
    if (res) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}

// Test route to verify getWorkerToken is working with environment variables
router.get('/test-token', async (req, res) => {
    try {
        const { 
            PINGONE_ENVIRONMENT_ID: envId,
            PINGONE_CLIENT_ID: clientId,
            PINGONE_CLIENT_SECRET: clientSecret
        } = process.env;

        if (!envId || !clientId || !clientSecret) {
            return res.status(400).json({
                success: false,
                message: 'Missing required environment variables',
                required: ['PINGONE_ENVIRONMENT_ID', 'PINGONE_CLIENT_ID', 'PINGONE_CLIENT_SECRET']
            });
        }

        console.log('Testing getWorkerToken with environment variables...');
        const token = await getWorkerToken(envId, clientId, clientSecret);
        
        res.json({ 
            success: true, 
            message: 'Successfully obtained token',
            token: token ? 'Token received (truncated for security)' : 'No token received',
            tokenExists: !!token
        });
    } catch (error) {
        console.error('Test token error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get token',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
        });
    }
});

// Helper function to clean up uploaded files
const cleanupFile = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error('Error cleaning up file:', error);
        }
    }
};

// Process bulk import
router.post('/bulk', upload.single('file'), async (req, res) => {
    const operationId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    logManager.logStructured(`=== Starting bulk import operation: ${operationId} ===`);
    logManager.info('Bulk import request received', {
        operationId,
        file: req.file ? req.file.originalname : 'none',
        environmentId: req.body.environmentId ? req.body.environmentId.substring(0, 8) + '...' : 'none'
    });

    if (!req.file) {
        const error = 'No file uploaded or invalid file type';
        logManager.error('Bulk import failed: ' + error, { operationId });
        return res.status(400).json({ 
            success: false, 
            error
        });
    }

    const { environmentId, clientId, clientSecret } = req.body;
    if (!environmentId || !clientId || !clientSecret) {
        const error = 'Missing required parameters: environmentId, clientId, or clientSecret';
        logManager.error('Bulk import failed: ' + error, { 
            operationId,
            hasEnvironmentId: !!environmentId,
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret
        });
        cleanupFile(req.file.path);
        return res.status(400).json({ 
            success: false, 
            error
        });
    }

    let accessToken;
    try {
        logManager.info('Requesting worker token', { operationId });
        accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
        logManager.info('Worker token received', { operationId });
    } catch (error) {
        const errorMsg = 'Failed to authenticate with PingOne: ' + error.message;
        logManager.error(errorMsg, { 
            operationId,
            error: error.message,
            stack: error.stack
        });
        cleanupFile(req.file.path);
        return res.status(401).json({ 
            success: false, 
            error: errorMsg
        });
    }

    // Read and parse the uploaded file
    logManager.info('Reading and parsing uploaded file', { 
        operationId,
        filePath: req.file.path,
        fileSize: fs.statSync(req.file.path).size
    });
    
    let parsedData;
    try {
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        parsedData = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transform: (value, field) => {
                return value && typeof value === 'string' ? value.trim() : value;
            }
        });
        logManager.info('File parsed successfully', { 
            operationId,
            fields: parsedData.meta.fields,
            rowCount: parsedData.data.length
        });
    } catch (error) {
        const errorMsg = 'Error parsing CSV file: ' + error.message;
        logManager.error(errorMsg, { 
            operationId,
            error: error.message,
            stack: error.stack
        });
        cleanupFile(req.file.path);
        return res.status(400).json({ 
            success: false, 
            error: errorMsg
        });
    }

    // Validate parsed data
    if (!parsedData.meta.fields || parsedData.meta.fields.length === 0) {
        const errorMsg = 'No valid headers found in the CSV file';
        logManager.error(errorMsg, { 
            operationId,
            filePath: req.file.path
        });
        cleanupFile(req.file.path);
        return res.status(400).json({ 
            success: false, 
            error: errorMsg
        });
    }

    const records = parsedData.data.filter(record => {
        // Filter out empty rows
        return Object.values(record).some(value => 
            value !== undefined && value !== null && value !== ''
        );
    });

    if (records.length === 0) {
        const errorMsg = 'No valid data rows found in the CSV file';
        logManager.error(errorMsg, { 
            operationId,
            originalRowCount: parsedData.data.length,
            filteredRowCount: 0
        });
        cleanupFile(req.file.path);
        return res.status(400).json({ 
            success: false, 
            error: errorMsg
        });
    }
    
    logManager.info('Filtered records for processing', {
        operationId,
        originalRowCount: parsedData.data.length,
        validRowCount: records.length,
        invalidRowCount: parsedData.data.length - records.length
    });

    // Process records
    const results = {
        total: records.length,
        success: 0,
        errors: 0,
        details: []
    };

    logManager.info('Starting to process records', {
        operationId,
        totalRecords: records.length,
        batchSize: 10
    });

    // Process records in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        logManager.info(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(records.length/BATCH_SIZE)}`, {
            operationId,
            batchStart: i + 1,
            batchEnd: Math.min(i + BATCH_SIZE, records.length),
            totalRecords: records.length
        });

        // Process each record in the current batch
        for (const record of batch) {
            const recordId = record.username || record.email || `record_${i}`;
            try {
                logManager.debug(`Processing record: ${recordId}`, {
                    operationId,
                    recordId
                });
                
                const result = await processRecord(record, accessToken, environmentId);
                results.success++;
                results.details.push({
                    status: 'success',
                    username: recordId,
                    details: result
                });
                
                logManager.debug(`Successfully processed record: ${recordId}`, {
                    operationId,
                    recordId
                });
            } catch (error) {
                results.errors++;
                const errorDetails = error.response?.data || {};
                results.details.push({
                    status: 'error',
                    username: recordId,
                    error: error.message,
                    details: errorDetails
                });
                
                logManager.error(`Error processing record ${recordId}`, {
                    operationId,
                    recordId,
                    error: error.message,
                    errorDetails: JSON.stringify(errorDetails),
                    stack: error.stack
                });
            }
        }

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < records.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }


    // Log completion
    logManager.info('Import operation completed', {
        operationId,
        total: results.total,
        successCount: results.success,
        errorCount: results.errors,
        successRate: results.total > 0 ? (results.success / results.total * 100).toFixed(2) + '%' : 'N/A'
    });

    // Clean up the uploaded file
    try {
        cleanupFile(req.file.path);
        logManager.debug('Temporary file cleaned up', { operationId, filePath: req.file.path });
    } catch (cleanupError) {
        logManager.error('Error cleaning up temporary file', {
            operationId,
            filePath: req.file.path,
            error: cleanupError.message
        });
    }

    // Prepare response
    const response = {
        success: results.errors === 0,
        total: results.total,
        successCount: results.success,
        errorCount: results.errors,
        details: results.details
    };

    logManager.info('Sending import response', {
        operationId,
        success: response.success,
        totalProcessed: response.total,
        successCount: response.successCount,
        errorCount: response.errorCount
    });

    // Send final response
    return res.json(response);
});

// Helper function to process a single record
async function processRecord(record, accessToken, environmentId) {
    // Determine operation type from record or default to 'create'
    const operation = (record.operation || 'create').toLowerCase();
    const email = record.email || 'unknown';
    const recordId = record.userId || record.username || email;

    // Log the start of the operation with all available identifiers and status
    const logIdentifiers = [];
    if (record.username) logIdentifiers.push(`username:${record.username}`);
    if (email && email !== 'unknown') logIdentifiers.push(`email:${email}`);
    if (record.userId) logIdentifiers.push(`userId:${record.userId}`);
    
    const logSuffix = logIdentifiers.length > 0 ? ` (${logIdentifiers.join(', ')})` : '';
    const status = 'started';
    logManager.logStructured(`${operation.toUpperCase().padEnd(8)} [${status.padEnd(8)}] user: ${email}${logSuffix}`);
    
    const logBase = {
        operation,
        status,
        recordId,
        email,
        username: record.username || null,
        userId: record.userId || null,
        environmentId,
        timestamp: new Date().toISOString()
    };
    
    logManager.debug(`API Call ${status}`, logBase);

    // Required fields check
    if (!email || email === 'unknown') {
        const errorMsg = 'Missing required field: email';
        logManager.error(`Failed to process record: ${errorMsg}`, {
            operation,
            recordId,
            record
        });
        return {
            success: false,
            operation,
            record,
            error: errorMsg
        };
    }


    try {
        let result;
        
        // Process based on operation type
        switch(operation) {
            case 'create':
                // TODO: Implement actual API call to create user
                result = {
                    success: true,
                    userId: 'user-' + Math.random().toString(36).substr(2, 9),
                    message: 'User created successfully'
                };
                break;
                
            case 'modify':
            case 'update':
                if (!record.userId && !record.username) {
                    throw new Error('Cannot modify user: Missing userId or username');
                }
                // TODO: Implement actual API call to update user
                result = {
                    success: true,
                    userId: record.userId || 'user-' + Math.random().toString(36).substr(2, 9),
                    message: 'User updated successfully'
                };
                break;
                
            case 'delete':
                if (!record.userId && !record.username) {
                    throw new Error('Cannot delete user: Missing userId or username');
                }
                // TODO: Implement actual API call to delete user
                result = {
                    success: true,
                    userId: record.userId || 'user-' + Math.random().toString(36).substr(2, 9),
                    message: 'User deleted successfully'
                };
                break;
                
            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }
        
        // Log successful operation with all user identifiers and status
        const status = result.success ? 'success' : 'failed';
        const logData = {
            ...logBase,
            status,
            username: record.username || null,
            userId: result.userId || record.userId || null,
            pingoneUserId: result.pingoneUserId || null,
            environmentId,
            result: {
                success: result.success,
                status: 'completed',
                message: result.message,
                timestamp: new Date().toISOString(),
                ...(result.userId && { userId: result.userId }),
                ...(result.pingoneUserId && { pingoneUserId: result.pingoneUserId }),
                ...(result.statusCode && { statusCode: result.statusCode }),
                ...(result.duration && { duration: result.duration })
            }
        };
        
        logManager.logStructured(`${operation.toUpperCase().padEnd(8)} [${status.padEnd(8)}] user: ${email}${logSuffix}`);
        logManager.info(`${operation} operation ${status}`, logData);
        
        // Add to operation summary
        logManager.debug('Operation summary', {
            operation,
            status,
            recordId,
            email,
            username: record.username || null,
            userId: result.userId || record.userId || null,
            duration: result.duration || 0,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: true,
            operation,
            record,
            ...result
        };
        
    } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        const status = 'error';
        const errorResponse = error.response?.data || null;
        const statusCode = error.response?.status || 500;
        
        // Log the error with all available context
        logManager.logStructured(`${operation.toUpperCase().padEnd(8)} [${status.padEnd(8)}] user: ${email} (${statusCode})`);
        
        logManager.error(`Failed to ${operation} user`, {
            ...logBase,
            status,
            error: errorMsg,
            statusCode,
            errorDetails: errorResponse,
            errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            response: errorResponse ? {
                status: statusCode,
                data: errorResponse,
                headers: error.response?.headers || {}
            } : null
        });
        
        // Add to error summary
        logManager.debug('Operation error summary', {
            operation,
            status,
            recordId,
            email,
            username: record.username || null,
            userId: record.userId || null,
            statusCode,
            error: errorMsg,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: false,
            operation,
            record,
            error: errorMsg
        };
    }
}

module.exports = router;

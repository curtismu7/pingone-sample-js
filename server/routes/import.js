const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const logManager = require('../utils/logManager');
const { getWorkerToken } = require('./token');

// Constants
const UPLOAD_DIR = path.join(os.tmpdir(), 'pingone-uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_ROWS_PER_REQUEST = 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests per window
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Configure rate limiting
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: 'Too many requests, please try again later.'
});

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
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
const sseConnections = new Map();

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    logManager.error('Failed to create upload directory', { error: error.message });
    throw new Error('Failed to initialize upload directory');
  }
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureUploadDir();
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `import-${uniqueSuffix}${ext}`);
  }
});

// File filter for multer
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['text/csv', 'application/vnd.ms-excel'];
  const isCSV = file.originalname.toLowerCase().endsWith('.csv');
  
  if (allowedTypes.includes(file.mimetype) || isCSV) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
});

/**
 * @route   GET /api/import/progress/:operationId
 * @desc    Server-Sent Events endpoint for import progress updates
 * @access  Private
 * @param   {string} operationId - The operation ID to track
 */
router.get('/progress/:operationId', [
  param('operationId').isString().notEmpty().withMessage('Operation ID is required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { operationId } = req.params;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no' // Disable buffering for nginx
  });

  // Send initial connection message
  res.write('data: ' + JSON.stringify({ type: 'connected', message: 'Connected to progress updates' }) + '\n\n');

  // Store the response object
  sseConnections.set(operationId, res);

  // Remove connection when client closes
  req.on('close', () => {
    if (sseConnections.has(operationId)) {
      sseConnections.delete(operationId);
      logManager.info('SSE connection closed', { operationId });
    }
  });
});

/**
 * Sends a progress update to the client via SSE
 * @param {string} operationId - The operation ID
 * @param {Object} data - Progress data to send
 */
function sendProgressUpdate(operationId, data) {
  const res = sseConnections.get(operationId);
  if (res && !res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify({
        ...data,
        timestamp: new Date().toISOString()
      })}\n\n`);
    } catch (error) {
      logManager.error('Failed to send progress update', {
        operationId,
        error: error.message
      });
      sseConnections.delete(operationId);
    }
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

/**
 * Cleans up temporary files
 * @param {string} filePath - Path to the file to clean up
 */
const cleanupFile = async (filePath) => {
  if (!filePath) return;
  
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    logManager.debug('Temporary file cleaned up', { filePath });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logManager.error('Error cleaning up file', {
        filePath,
        error: error.message
      });
    }
  }
};

/**
 * @route   POST /api/import/bulk
 * @desc    Process bulk import of users from CSV
 * @access  Private
 * @param   {File} file - CSV file containing user data
 * @param   {string} environmentId - PingOne environment ID
 * @param   {string} clientId - API client ID
 * @param   {string} clientSecret - API client secret
 * @returns {Object} Import results
 */
router.post('/bulk', [
  apiLimiter,
  sanitizeInput,
  upload.single('file'),
  body('environmentId').isString().notEmpty().withMessage('Environment ID is required'),
  body('clientId').isString().notEmpty().withMessage('Client ID is required'),
  body('clientSecret').isString().notEmpty().withMessage('Client secret is required')
], async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const operationId = `import_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const { environmentId, clientId, clientSecret } = req.body;
  
  // Log the start of the import
  logManager.info('Bulk import request received', {
    operationId,
    file: req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : null,
    environmentId: environmentId ? `${environmentId.substring(0, 4)}...` : 'none'
  });

  // Check if file was uploaded
  if (!req.file) {
    const error = 'No file uploaded or invalid file type';
    logManager.error('Bulk import failed: No file', { operationId });
    return res.status(400).json({ 
      success: false, 
      error,
      code: 'NO_FILE_UPLOADED'
    });
  }

  // Get authentication token
  let accessToken;
  try {
    logManager.debug('Requesting worker token', { operationId });
    accessToken = await getWorkerToken(environmentId, clientId, clientSecret);
    logManager.debug('Worker token received', { operationId });
  } catch (error) {
    const errorMsg = 'Failed to authenticate with PingOne';
    logManager.error(errorMsg, { 
      operationId,
      error: error.message,
      code: error.response?.data?.error || 'AUTH_ERROR',
      status: error.response?.status
    });
    
    await cleanupFile(req.file.path);
    return res.status(401).json({ 
      success: false, 
      error: errorMsg,
      code: 'AUTHENTICATION_FAILED',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }

  // Read and parse the uploaded file
  logManager.info('Reading and parsing uploaded file', { 
    operationId,
    filePath: req.file.path,
    fileSize: req.file.size
  });
  
  let parsedData;
  try {
    const fileContent = await fs.readFile(req.file.path, 'utf8');
    
    // Validate file content size
    if (fileContent.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }
    
    parsedData = await new Promise((resolve, reject) => {
      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        delimiter: ',',  // Explicitly set delimiter to comma
        quoteChar: '"', // Explicitly set quote character
        escapeChar: '"', // Explicitly set escape character
        transform: (value, field) => {
          return value && typeof value === 'string' ? value.trim() : value;
        },
        transformHeader: (header) => {
          // Clean up header names
          return header ? header.trim().replace(/^"|"$/g, '') : '';
        },
        complete: (results) => {
          if (results.errors.length > 0) {
            return reject(new Error(`CSV parse error: ${results.errors[0].message}`));
          }
          resolve(results);
        },
        error: (error) => reject(error)
      });
    });
    
    // Validate row count
    if (parsedData.data.length > MAX_ROWS_PER_REQUEST) {
      throw new Error(`CSV contains too many rows (max ${MAX_ROWS_PER_REQUEST})`);
    }
    
    logManager.info('File parsed successfully', { 
      operationId,
      fields: parsedData.meta.fields,
      rowCount: parsedData.data.length
    });
    
  } catch (error) {
    const errorMsg = 'Error parsing CSV file';
    logManager.error(errorMsg, { 
      operationId,
      error: error.message,
      code: 'CSV_PARSE_ERROR',
      stack: error.stack
    });
    
    await cleanupFile(req.file.path);
    return res.status(400).json({ 
      success: false, 
      error: 'Failed to parse CSV file',
      code: 'CSV_PARSE_ERROR',
      details: error.message
    });
  }

    // Validate parsed data
    if (!parsedData.meta.fields || parsedData.meta.fields.length === 0) {
        const errorMsg = 'No valid headers found in the CSV file';
        logManager.error(errorMsg, { 
            operationId,
            filePath: req.file.path
        });
        await cleanupFile(req.file.path);
        return res.status(400).json({ 
            success: false, 
            error: errorMsg,
            code: 'MISSING_HEADERS'
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
        await cleanupFile(req.file.path);
        return res.status(400).json({ 
            success: false, 
            error: errorMsg,
            code: 'NO_VALID_DATA',
            originalRowCount: parsedData.data.length
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
        logManager.error('Error during cleanup', {
            operationId,
            filePath: req.file?.path,
            error: cleanupError.message,
            stack: cleanupError.stack
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

// Error handling middleware for async routes
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Note: asyncHandler is automatically applied to all routes via express-async-handler middleware
// No need to manually wrap routes here

// Global error handler
router.use((err, req, res, next) => {
  logManager.error('Unhandled error in import routes', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
    requestId: req.id,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;

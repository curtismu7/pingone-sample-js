const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { getWorkerToken } = require('./token');

const router = express.Router();

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
        cb(null, file.fieldname + '-' + uniqueSuffix + '.csv');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
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

// POST /api/import - Import users from CSV
router.post('/', upload.single('csv'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file uploaded' });
        }

        const { environmentId, clientId, clientSecret } = req.body;
        
        if (!environmentId || !clientId || !clientSecret) {
            return res.status(400).json({ 
                error: 'Missing required PingOne credentials' 
            });
        }

        logger.info('Starting CSV import', {
            filename: req.file.originalname,
            size: req.file.size,
            environmentId
        });

        // Read and parse CSV file
        const csvData = fs.readFileSync(req.file.path, 'utf8');
        const parseResult = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim()
        });

        if (parseResult.errors && parseResult.errors.length > 0) {
            logger.warn('CSV parsing warnings', { errors: parseResult.errors });
        }

        const users = parseResult.data;
        logger.info('CSV parsed successfully', { 
            recordCount: users.length,
            headers: Object.keys(users[0] || {})
        });

        // Get worker token
        const token = await getWorkerToken(environmentId, clientId, clientSecret);

        // Process users
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            try {
                const userData = mapUserData(user);
                const result = await createUser(userData, environmentId, token);
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'success',
                    message: 'User created successfully',
                    userId: result.id
                });
                
                successCount++;
                
            } catch (error) {
                const errorMessage = error.response?.data?.detail || error.message;
                
                results.push({
                    username: user.username || user.email || `user-${i}`,
                    status: 'error',
                    message: errorMessage
                });
                
                errorCount++;
            }

            // Log progress every 10 users
            if ((i + 1) % 10 === 0) {
                logger.info('Import progress', {
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
        logger.info('CSV import completed', {
            filename: req.file.originalname,
            totalRecords: users.length,
            successCount,
            errorCount,
            duration: `${duration}ms`
        });

        res.json({
            success: true,
            results,
            summary: {
                total: users.length,
                successful: successCount,
                failed: errorCount,
                duration: duration
            }
        });

    } catch (error) {
        logger.error('CSV import error', {
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
        const userData = mapUserData(user);
        const result = await createUser(userData, environmentId, token);

        logger.info('Single user import successful', {
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
        logger.error('Single user import error', {
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

// Helper function to map CSV data to PingOne user format
function mapUserData(user) {
    const userData = {
        username: user.username,
        email: user.email,
        population: { id: user.populationId },
        name: {
            given: user.firstName || user.first_name,
            family: user.lastName || user.last_name
        }
    };

    // Optional fields
    if (user.middleName || user.middle_name) {
        userData.name.middle = user.middleName || user.middle_name;
    }
    if (user.prefix) userData.name.prefix = user.prefix;
    if (user.suffix) userData.name.suffix = user.suffix;
    if (user.formattedName || user.formatted_name) {
        userData.name.formatted = user.formattedName || user.formatted_name;
    }
    if (user.title) userData.title = user.title;
    if (user.preferredLanguage || user.preferred_language) {
        userData.preferredLanguage = user.preferredLanguage || user.preferred_language;
    }
    if (user.locale) userData.locale = user.locale;
    if (user.timezone) userData.timezone = user.timezone;
    if (user.externalId || user.external_id) {
        userData.externalId = user.externalId || user.external_id;
    }
    if (user.type) userData.type = user.type;
    if (user.active !== undefined && user.active !== "") {
        userData.active = user.active === 'true' || user.active === true;
    }
    if (user.nickname) userData.nickname = user.nickname;
    if (user.password) userData.password = user.password;

    // Phone numbers
    const phoneNumbers = [];
    if (user.primaryPhone || user.primary_phone) {
        phoneNumbers.push({ 
            type: 'primary', 
            value: user.primaryPhone || user.primary_phone 
        });
    }
    if (user.mobilePhone || user.mobile_phone) {
        phoneNumbers.push({ 
            type: 'mobile', 
            value: user.mobilePhone || user.mobile_phone 
        });
    }
    if (phoneNumbers.length > 0) {
        userData.phoneNumbers = phoneNumbers;
    }

    // Address
    if (user.streetAddress || user.street_address || user.countryCode || user.country_code || 
        user.locality || user.region || user.postalCode || user.postal_code) {
        userData.address = {};
        if (user.streetAddress || user.street_address) {
            userData.address.streetAddress = user.streetAddress || user.street_address;
        }
        if (user.countryCode || user.country_code) {
            userData.address.country = user.countryCode || user.country_code;
        }
        if (user.locality) userData.address.locality = user.locality;
        if (user.region) userData.address.region = user.region;
        if (user.postalCode || user.postal_code) {
            userData.address.postalCode = user.postalCode || user.postal_code;
        }
    }

    return userData;
}

// Helper function to create user in PingOne
async function createUser(userData, environmentId, token) {
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

    return response.data;
}

module.exports = router; 
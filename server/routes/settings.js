const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SETTINGS_DIR = path.join(__dirname, '../../settings');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Initialize settings directory and file
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

// Securely generate a random encryption key if it doesn't exist
const KEY_FILE = path.join(SETTINGS_DIR, 'encryption.key');
let encryptionKey;
if (!fs.existsSync(KEY_FILE)) {
    encryptionKey = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, encryptionKey);
    fs.chmodSync(KEY_FILE, 0o600); // Make it readable only by owner
} else {
    encryptionKey = fs.readFileSync(KEY_FILE);
}

// Initialize settings file if it doesn't exist
if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
        filename: '',
        clientId: '',
        clientSecret: '',
        environmentId: '',
        lastUpdated: new Date().toISOString()
    }, null, 2));
    fs.chmodSync(SETTINGS_FILE, 0o600); // Make it readable only by owner
}

// Encrypt sensitive data
function encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// Decrypt sensitive data
function decrypt(encryptedData) {
    if (!encryptedData) return '';
    
    const parts = encryptedData.split(':');
    if (parts.length !== 2) return '';
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return '';
    }
}

// Get settings
router.get('/', (req, res) => {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        // Decrypt sensitive fields
        settings.clientId = decrypt(settings.clientId);
        settings.clientSecret = decrypt(settings.clientSecret);
        settings.environmentId = decrypt(settings.environmentId);
        
        // Mask sensitive information in response
        const maskedSettings = {
            filename: settings.filename,
            clientId: settings.clientId ? settings.clientId.substring(0, 8) + '...' : '',
            clientSecret: settings.clientSecret ? '********' : '',
            environmentId: settings.environmentId ? settings.environmentId.substring(0, 8) + '...' : '',
            lastUpdated: settings.lastUpdated
        };
        
        res.json(maskedSettings);
    } catch (error) {
        console.error('Error reading settings:', error);
        res.status(500).json({ error: 'Failed to read settings' });
    }
});

// Update settings
router.post('/', (req, res) => {
    try {
        const { filename, clientId, clientSecret, environmentId } = req.body;
        
        // Encrypt sensitive fields
        const encryptedSettings = {
            filename: filename || '',
            clientId: clientId ? encrypt(clientId) : '',
            clientSecret: clientSecret ? encrypt(clientSecret) : '',
            environmentId: environmentId ? encrypt(environmentId) : '',
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(encryptedSettings, null, 2));
        res.json({ 
            success: true, 
            message: 'Settings saved successfully',
            data: {
                filename: filename || '',
                lastUpdated: encryptedSettings.lastUpdated
            }
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

module.exports = router;

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const logger = require('morgan');
const logManager = require('./utils/logManager');

// Import routers
const importRouter = require('./routes/import');
const tokenRouter = require('./routes/token');

const app = express();

// Middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// Serve static files from the public directory
const publicPath = path.resolve(__dirname, '../public');
console.log('Serving static files from:', publicPath);

// Log directory contents
fs.readdir(publicPath, (err, files) => {
    if (err) {
        console.error('Error reading public directory:', err);
    } else {
        console.log('Public directory contents:', files);
    }
});

app.use(express.static(publicPath));

// API routes
app.use('/api/import', importRouter);
app.use('/api/token', tokenRouter.router);

// Handle SPA routing - serve index.html for any other GET requests
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    console.log('Attempting to serve:', indexPath);
    
    if (fs.existsSync(indexPath)) {
        console.log('File exists, sending...');
        res.sendFile(indexPath);
    } else {
        console.error('File does not exist:', indexPath);
        res.status(404).send('File not found');
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

module.exports = app;

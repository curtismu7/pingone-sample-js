const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./server/app');

// Load environment variables
require('dotenv').config();

// Get port from environment or use default
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const MAX_PORT_ATTEMPTS = 10; // Maximum number of ports to try

// Function to find an available port
const getAvailablePort = (basePort, maxAttempts = 10) => {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const tryPort = (port) => {
      const server = http.createServer().listen(port);
      
      server.on('listening', () => {
        server.close(() => resolve(port));
      });
      
      server.on('error', (err) => {
        attempts++;
        if (attempts >= maxAttempts) {
          return reject(new Error(`No available ports found after ${maxAttempts} attempts`));
        }
        tryPort(port + 1);
      });
    };
    
    tryPort(basePort);
  });
};

// Create HTTP server (for redirect to HTTPS)
const createHttpServer = async (httpsPort) => {
  try {
    const port = await getAvailablePort(HTTP_PORT);
    const server = http.createServer((req, res) => {
      const host = req.headers.host.split(':')[0];
      res.writeHead(301, { 'Location': `https://${host}:${httpsPort}${req.url}` });
      res.end();
    });

    server.listen(port, () => {
      console.log(`HTTP server running on port ${port} (redirects to HTTPS)`);
    });

    server.on('error', (error) => {
      console.error('HTTP server error:', error);
    });

    return server;
  } catch (error) {
    console.error('Failed to start HTTP server:', error);
    return null;
  }
};

// Create HTTPS server
const createHttpsServer = async () => {
  try {
    const port = await getAvailablePort(HTTPS_PORT);
    
    const httpsOptions = {
      key: fs.readFileSync(path.join(__dirname, 'certs/key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'certs/cert.pem')),
      // For development only - allows self-signed certificates
      rejectUnauthorized: false
    };
    
    const server = https.createServer(httpsOptions, app);
    
    server.listen(port, () => {
      console.log(`\n=== Server Started ===`);
      console.log(`HTTPS server running on port ${port}`);
      console.log(`Access the application at: https://localhost:${port}`);
      console.log('Note: Using self-signed certificate. You may need to accept the security warning in your browser.\n');
    });
    
    server.on('error', (error) => {
      console.error('HTTPS server error:', error);
    });
    
    return { server, port };
  } catch (error) {
    console.error('Failed to start HTTPS server:', error);
    if (error.code === 'ENOENT') {
      console.error('Make sure you have generated SSL certificates in the certs/ directory.');
    }
    process.exit(1);
  }
};

// Start both servers
const startServers = async () => {
  try {
    const { port } = await createHttpsServer();
    await createHttpServer(port);
  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
};

// Start the servers
startServers();

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down servers...');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  httpsServer.close(() => {
    console.log('HTTPS server closed');
    process.exit(0);
  });
});
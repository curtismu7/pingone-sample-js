const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { logManager } = require('../server/utils/logManager');
const logsRouter = require('../server/routes/logs');

// Mock required environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'debug';

// Create a test Express app
const app = express();

// Set up middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount logs router
app.use('/api/logs', logsRouter);

describe('Logs API Endpoints', () => {
    let testLogFile;
    const testLogData = {
        level: 'info',
        message: 'Test log message',
        meta: {
            test: 'test data'
        }
    };

    beforeAll(async () => {
        // Create a test log file
        testLogFile = path.join(__dirname, '../server/logs/test.log');
        await fs.writeFile(testLogFile, '');
        
        // Configure log manager for testing
        logManager.configure({
            logFile: testLogFile,
            level: 'debug'
        });
    });

    afterAll(async () => {
        // Clean up test files
        try {
            await fs.unlink(testLogFile);
        } catch (error) {
            // Ignore if file doesn't exist
        }
    });

    describe('GET /logs', () => {
        it('should return paginated logs with default parameters', async () => {
            const response = await request(app)
                .get('/api/logs')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body).toHaveProperty('metadata');
        });

        it('should filter logs by level', async () => {
            const response = await request(app)
                .get('/api/logs')
                .query({ level: 'error' })
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toEqual([]); // No errors in test logs
        });
    });

    describe('POST /logs', () => {
        it('should create a new log entry', async () => {
            const response = await request(app)
                .post('/api/logs')
                .send(testLogData)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('metadata');
            expect(response.body.metadata).toHaveProperty('level', testLogData.level);
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/logs')
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /logs/config', () => {
        it('should return current logging configuration', async () => {
            const response = await request(app)
                .get('/api/logs/config')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('logFile');
            expect(response.body.data).toHaveProperty('logLevel');
        });
    });

    describe('POST /logs/config', () => {
        it('should update logging configuration', async () => {
            const response = await request(app)
                .post('/api/logs/config')
                .send({
                    logLevel: 'debug',
                    logFile: testLogFile
                })
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('logLevel', 'debug');
            expect(response.body.data).toHaveProperty('logFile', testLogFile);
        });

        it('should validate absolute log file path', async () => {
            const response = await request(app)
                .post('/api/logs/config')
                .send({
                    logFile: 'relative/path.log'
                })
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error', 'Log file path must be an absolute path');
        });
    });

    describe('POST /logs/start', () => {
        it('should start file logging', async () => {
            const response = await request(app)
                .post('/api/logs/start')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('isLogging', true);
        });
    });

    describe('POST /logs/stop', () => {
        it('should stop file logging', async () => {
            const response = await request(app)
                .post('/api/logs/stop')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('isLogging', false);
        });
    });

    describe('GET /logs/export', () => {
        it('should export log file', async () => {
            const response = await request(app)
                .get('/api/logs/export')
                .expect(200);

            expect(response.headers['content-type']).toBe('text/plain');
            expect(response.headers['content-disposition']).toContain('attachment');
        });

        it('should handle large log files', async () => {
            // Create a large test file
            const largeContent = 'a'.repeat(10 * 1024 * 1024 + 1); // 10MB + 1
            await fs.writeFile(testLogFile, largeContent);

            const response = await request(app)
                .get('/api/logs/export')
                .expect(413);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error', 'Log file too large to export');
        });
    });

    describe('POST /logs/clear', () => {
        it('should clear log file', async () => {
            // Create some test content
            await fs.writeFile(testLogFile, 'test content');

            const response = await request(app)
                .post('/api/logs/clear')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message', 'Log file cleared successfully');

            // Verify file is empty
            const content = await fs.readFile(testLogFile, 'utf8');
            expect(content).toBe('');
        });
    });
});

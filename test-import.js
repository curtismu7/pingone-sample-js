const fs = require('fs');
// Import the log manager instance directly
const logManager = require('./server/utils/logManager');

// Mock user data
const testUsers = [
    { email: 'test1@example.com', username: 'testuser1', operation: 'create' },
    { email: 'test2@example.com', username: 'testuser2', operation: 'modify', userId: 'user-123' },
    { email: 'test3@example.com', username: 'testuser3', operation: 'delete', userId: 'user-456' },
    { email: 'invalid-email', username: 'baduser', operation: 'create' }  // This will trigger an error
];

// CSV File Information
const CSV_FILE = 'test-import.csv';
const CSV_HEADER = 'email,username,operation';
const CSV_RECORDS = [
    'test1@example.com,testuser1,create',
    'test2@example.com,testuser2,modify',
    'test3@example.com,testuser3,delete'
];

// Display CSV file information
function displayCsvInfo() {
    logManager.logStructured(`\n${'='.repeat(40)} CSV FILE INFORMATION ${'='.repeat(40)}`);
    logManager.logStructured(`File: ${CSV_FILE}`);
    logManager.logStructured(`Header: ${CSV_HEADER}`);
    logManager.logStructured(`\nFirst ${CSV_RECORDS.length} records:`);
    CSV_RECORDS.forEach((record, index) => {
        logManager.logStructured(`${index + 1}. ${record}`);
    });
    logManager.logStructured('='.repeat(100));
}

async function testLogging() {
    logManager.logStructured('=== STARTING LOGGING DEMO ===');
    displayCsvInfo();
    
    // Simulate processing each user
    for (const user of testUsers) {
        const { email, username, operation, userId } = user;
        const recordId = userId || username || email;
        
        // Log the start of processing
        logManager.logStructured(`${operation.toUpperCase().padEnd(8)} [started ] user: ${email} (${[ 
            `username:${username}`,
            userId && `userId:${userId}`
        ].filter(Boolean).join(', ')})`);
        
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Simulate success/failure
            if (!email.includes('@')) {
                throw new Error('Invalid email format');
            }
            
            // Simulate successful operation
            const status = 'success';
            const result = {
                success: true,
                userId: userId || `user-${Math.random().toString(36).substr(2, 8)}`,
                pingoneUserId: `p1-${Math.random().toString(36).substr(2, 10)}`,
                message: `${operation} operation completed`,
                statusCode: 200,
                duration: 150 + Math.floor(Math.random() * 100)
            };
            
            logManager.logStructured(`${operation.toUpperCase().padEnd(8)} [${status.padEnd(8)}] user: ${email} (${result.statusCode})`);
            logManager.info(`${operation} operation ${status}`, {
                operation,
                status,
                recordId,
                email,
                username,
                userId: result.userId,
                pingoneUserId: result.pingoneUserId,
                result: {
                    success: result.success,
                    status: 'completed',
                    message: result.message,
                    timestamp: new Date().toISOString(),
                    statusCode: result.statusCode,
                    duration: result.duration
                }
            });
            
        } catch (error) {
            const status = 'error';
            const statusCode = 400;
            
            logManager.logStructured(`${operation.toUpperCase().padEnd(8)} [${status.padEnd(8)}] user: ${email} (${statusCode})`);
            logManager.error(`Failed to ${operation} user`, {
                operation,
                status,
                recordId,
                email,
                username,
                userId: userId || null,
                error: error.message,
                statusCode,
                timestamp: new Date().toISOString(),
                errorDetails: { field: 'email', message: error.message }
            });
        }
    }
    
    logManager.logStructured('=== LOGGING DEMO COMPLETE ===');
}

testLogging();

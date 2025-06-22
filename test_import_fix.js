const fs = require('fs');
const axios = require('axios');

// Test the import fix
async function testImportFix() {
    try {
        console.log('Testing import fix...');
        
        // Read the test CSV file
        const csvData = fs.readFileSync('fresh_test_users.csv', 'utf8');
        
        // Parse CSV to get users
        const lines = csvData.split('\n');
        const headers = lines[0].split(',');
        const users = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',');
                const user = {};
                headers.forEach((header, index) => {
                    user[header.trim()] = values[index]?.trim();
                });
                users.push(user);
            }
        }
        
        console.log(`Found ${users.length} users to test`);
        console.log('User data:', JSON.stringify(users, null, 2));
        
        // Test the bulk import endpoint
        const response = await axios.post('http://localhost:3002/api/import/bulk', {
            users: users,
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
            clientId: process.env.PINGONE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.PINGONE_CLIENT_SECRET || 'your-client-secret'
        });
        
        console.log('Import response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testImportFix(); 
const axios = require('axios');

// Test the delete functionality
async function testDelete() {
    try {
        console.log('Testing delete functionality...');
        
        // Test data for deletion
        const testData = {
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
            clientId: process.env.PINGONE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.PINGONE_CLIENT_SECRET || 'your-client-secret'
        };
        
        console.log('Test data:', JSON.stringify(testData, null, 2));
        
        // Test the delete endpoint (using a dummy user ID)
        console.log('\n--- Testing single user delete ---');
        const response = await axios.delete('http://localhost:3002/api/delete/user/test-user-id', {
            data: testData
        });
        
        console.log('Delete response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('Single delete test failed:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.response?.status) {
            console.error('Response status:', error.response.status);
        }
    }
    
    try {
        console.log('\n--- Testing bulk delete ---');
        
        // Test bulk delete data
        const bulkTestData = {
            userIds: ["test-user-1", "test-user-2", "test-user-3"],
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
            clientId: process.env.PINGONE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.PINGONE_CLIENT_SECRET || 'your-client-secret'
        };
        
        console.log('Bulk test data:', JSON.stringify(bulkTestData, null, 2));
        
        const bulkResponse = await axios.post('http://localhost:3002/api/delete/bulk', bulkTestData);
        console.log('Bulk delete response:', JSON.stringify(bulkResponse.data, null, 2));
        
    } catch (error) {
        console.error('Bulk delete test failed:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.response?.status) {
            console.error('Response status:', error.response.status);
        }
    }
    
    try {
        console.log('\n--- Testing delete by username ---');
        
        // Test delete by username data
        const usernameTestData = {
            username: "testuser123",
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
            clientId: process.env.PINGONE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.PINGONE_CLIENT_SECRET || 'your-client-secret'
        };
        
        console.log('Username test data:', JSON.stringify(usernameTestData, null, 2));
        
        const usernameResponse = await axios.post('http://localhost:3002/api/delete/by-username', usernameTestData);
        console.log('Delete by username response:', JSON.stringify(usernameResponse.data, null, 2));
        
    } catch (error) {
        console.error('Delete by username test failed:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.response?.status) {
            console.error('Response status:', error.response.status);
        }
    }
}

testDelete(); 
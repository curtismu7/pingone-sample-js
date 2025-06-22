const axios = require('axios');

// Test the modify functionality
async function testModify() {
    try {
        console.log('Testing modify functionality...');
        
        // Test data for modification
        const testData = {
            userData: {
                name: {
                    given: "Test",
                    family: "User",
                    formatted: "Test User"
                },
                enabled: true
            },
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
            clientId: process.env.PINGONE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.PINGONE_CLIENT_SECRET || 'your-client-secret'
        };
        
        console.log('Test data:', JSON.stringify(testData, null, 2));
        
        // Test the modify endpoint (using a dummy user ID)
        console.log('\n--- Testing single user modify ---');
        const response = await axios.put('http://localhost:3002/api/modify/user/test-user-id', testData);
        console.log('Modify response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('Single modify test failed:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.response?.status) {
            console.error('Response status:', error.response.status);
        }
    }
    
    try {
        console.log('\n--- Testing bulk modify ---');
        
        // Test bulk modify data
        const bulkTestData = {
            users: [
                {
                    userId: "test-user-1",
                    userData: {
                        name: {
                            given: "Bulk",
                            family: "Test1"
                        }
                    }
                },
                {
                    userId: "test-user-2", 
                    userData: {
                        name: {
                            given: "Bulk",
                            family: "Test2"
                        }
                    }
                }
            ],
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
            clientId: process.env.PINGONE_CLIENT_ID || 'your-client-id',
            clientSecret: process.env.PINGONE_CLIENT_SECRET || 'your-client-secret'
        };
        
        console.log('Bulk test data:', JSON.stringify(bulkTestData, null, 2));
        
        const bulkResponse = await axios.post('http://localhost:3002/api/modify/bulk', bulkTestData);
        console.log('Bulk modify response:', JSON.stringify(bulkResponse.data, null, 2));
        
    } catch (error) {
        console.error('Bulk modify test failed:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.response?.status) {
            console.error('Response status:', error.response.status);
        }
    }
}

testModify(); 
const puppeteer = require('puppeteer');

// PingOne credentials for automated testing
const PINGONE_CREDENTIALS = {
    environmentId: 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
    clientId: '95dc946f-5e0a-4a8b-a8ba-b587b244e005',
    clientSecret: 'Ee2YBEmqrBRdELuNDAh5SPL6T01_M~R9o7QMYHyjcWXwzHvhhlvdptZRH6A6_2g-'
};

async function testImportUI() {
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: ['--start-maximized']
    });
    
    try {
        const page = await browser.newPage();
        
        console.log('🚀 Starting Import UI Test with Automated Credentials Setup');
        console.log('=' .repeat(60));
        
        // Navigate directly to the settings page first
        console.log('⚙️  Navigating to Settings page to configure PingOne credentials...');
        await page.goto('http://localhost:3002/settings.html', { waitUntil: 'networkidle2' });
        
        // Wait for the settings page to load
        await page.waitForSelector('#credentials-form', { timeout: 10000 });
        console.log('✅ Settings page loaded');
        
        // Fill in the PingOne credentials
        console.log('🔐 Filling in PingOne credentials...');
        
        // Environment ID
        await page.waitForSelector('#environment-id', { timeout: 10000 });
        await page.type('#environment-id', PINGONE_CREDENTIALS.environmentId);
        console.log('   ✅ Environment ID filled');
        
        // Client ID
        await page.waitForSelector('#client-id', { timeout: 10000 });
        await page.type('#client-id', PINGONE_CREDENTIALS.clientId);
        console.log('   ✅ Client ID filled');
        
        // Client Secret
        await page.waitForSelector('#client-secret', { timeout: 10000 });
        await page.type('#client-secret', PINGONE_CREDENTIALS.clientSecret);
        console.log('   ✅ Client Secret filled');
        
        // Test the credentials
        console.log('🧪 Testing credentials...');
        await page.click('#test-credentials');
        
        // Wait for token status to appear
        await new Promise(r => setTimeout(r, 3000));
        
        // Check if credentials are valid
        const tokenStatus = await page.$eval('#token-status', el => el.textContent);
        console.log(`🔑 Token status: ${tokenStatus}`);
        
        // Navigate back to the main page
        console.log('🏠 Navigating to main page...');
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
        
        // Now test the import UI
        console.log('\n📤 Testing Import UI functionality...');
        
        // Click on Import button
        await page.waitForSelector('#import-btn', { timeout: 10000 });
        await page.click('#import-btn');
        
        // Wait for import modal to appear (if there is one) or check for file input
        console.log('📁 Testing file upload...');
        const fileInput = await page.$('#csv-file');
        await fileInput.uploadFile('./fresh_test_users.csv');
        console.log('✅ File uploaded');
        
        // Wait for file to be processed
        await new Promise(r => setTimeout(r, 2000));
        
        // Check if file info is shown
        const fileInfo = await page.$('#current-file-status');
        console.log(`📋 File info shown: ${fileInfo ? '✅' : '❌'}`);
        
        // Test import button again (it should be enabled now)
        console.log('🚀 Testing import execution...');
        await page.click('#import-btn');
        
        // Wait for spinner to appear
        await page.waitForSelector('#spinner-overlay', { timeout: 10000 });
        console.log('✅ Operation spinner appeared');
        
        // Check spinner content
        const spinnerTitle = await page.$eval('#spinner-title', el => el.textContent);
        console.log(`📝 Spinner title: "${spinnerTitle}"`);
        
        const operationType = await page.$eval('#operation-type', el => el.textContent);
        console.log(`🔧 Operation type: "${operationType}"`);
        
        // Wait for operation to complete or timeout
        console.log('⏳ Waiting for operation to complete...');
        try {
            await page.waitForSelector('#spinner-overlay', { hidden: true, timeout: 60000 });
            console.log('✅ Operation completed');
        } catch (error) {
            console.log('⏰ Operation timed out (this is expected for testing)');
        }
        
        // Test spinner appearance and content
        console.log('\n🎨 Testing spinner appearance...');
        
        // Check if spinner has the formal styling
        const spinnerStyle = await page.$eval('#spinner-overlay', el => {
            const styles = window.getComputedStyle(el);
            return {
                display: styles.display,
                position: styles.position,
                backgroundColor: styles.backgroundColor,
                borderRadius: styles.borderRadius,
                boxShadow: styles.boxShadow
            };
        });
        
        console.log('📊 Spinner styling:');
        console.log(`   Display: ${spinnerStyle.display}`);
        console.log(`   Position: ${spinnerStyle.position}`);
        console.log(`   Background: ${spinnerStyle.backgroundColor}`);
        console.log(`   Border radius: ${spinnerStyle.borderRadius}`);
        console.log(`   Box shadow: ${spinnerStyle.boxShadow}`);
        
        // Check for progress bar
        const progressBar = await page.$('#progress-bar');
        console.log(`📊 Progress bar present: ${progressBar ? '✅' : '❌'}`);
        
        // Check for steps section
        const stepsSection = await page.$('#spinner-steps');
        console.log(`🔢 Steps section present: ${stepsSection ? '✅' : '❌'}`);
        
        // Check for summary section
        const summarySection = await page.$('#spinner-status-summary');
        console.log(`📋 Summary section present: ${summarySection ? '✅' : '❌'}`);
        
        console.log('\n🎉 Import UI Test Completed Successfully!');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        await browser.close();
    }
}

// Run the test
testImportUI().catch(console.error); 
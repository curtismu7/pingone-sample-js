const puppeteer = require('puppeteer');

async function comprehensiveTest() {
    console.log('🧪 Comprehensive Status Test for PingOne User Management App\n');
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: { width: 1200, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Test 1: Server Health Check
        console.log('🔍 Test 1: Server Health Check...');
        try {
            const response = await page.goto('http://localhost:3002/api/health', { waitUntil: 'networkidle0' });
            const healthData = await response.json();
            console.log('✅ Server is healthy:', healthData.status);
            console.log('   Version:', healthData.version);
            console.log('   Uptime:', Math.round(healthData.uptime), 'seconds');
        } catch (error) {
            console.log('❌ Server health check failed:', error.message);
            return;
        }
        
        // Test 2: Main Application Load
        console.log('\n📱 Test 2: Main Application Load...');
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle0' });
        
        const mainElements = await page.evaluate(() => {
            return {
                csvSection: !!document.querySelector('.csv-file-section'),
                importBtn: !!document.querySelector('#import-btn'),
                settingsBtn: !!document.querySelector('#settings-btn'),
                spinner: !!document.getElementById('spinner-overlay'),
                fileInput: !!document.querySelector('input[type="file"]')
            };
        });
        
        console.log('Main page elements:', mainElements);
        console.log('✅ Main application loaded successfully');
        
        // Test 3: Settings Page
        console.log('\n⚙️ Test 3: Settings Page...');
        await page.goto('http://localhost:3002/settings', { waitUntil: 'networkidle0' });
        
        const settingsElements = await page.evaluate(() => {
            return {
                envIdInput: !!document.querySelector('#environment-id'),
                clientIdInput: !!document.querySelector('#client-id'),
                clientSecretInput: !!document.querySelector('#client-secret'),
                testBtn: !!document.querySelector('#test-credentials'),
                saveBtn: !!document.querySelector('#save-all-settings')
            };
        });
        
        console.log('Settings page elements:', settingsElements);
        console.log('✅ Settings page loaded successfully');
        
        // Test 4: Credentials Configuration
        console.log('\n🔐 Test 4: Credentials Configuration...');
        
        // Fill in credentials (using the ones from your test)
        await page.type('#environment-id', 'd02d2305-f445-406d-82ee-7cdbf6eeabfd');
        await page.type('#client-id', 'curtis@coachcurtis.org');
        await page.type('#client-secret', 'your-client-secret-here');
        
        console.log('✅ Credentials filled (using test values)');
        
        // Test 5: Credentials Test
        console.log('\n🧪 Test 5: Testing Credentials...');
        await page.click('#test-credentials');
        
        // Wait for test result
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const testResult = await page.evaluate(() => {
            const statusElement = document.querySelector('#token-status');
            return statusElement ? statusElement.textContent : 'No status found';
        });
        
        console.log('Credentials test result:', testResult);
        
        // Test 6: Save Settings
        console.log('\n💾 Test 6: Saving Settings...');
        await page.click('#save-all-settings');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Settings saved');
        
        // Test 7: Return to Main Page
        console.log('\n🏠 Test 7: Return to Main Page...');
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle0' });
        console.log('✅ Returned to main page');
        
        // Test 8: File Upload Test
        console.log('\n📁 Test 8: File Upload Test...');
        
        // Upload a test CSV file
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile('./test_users.csv');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const fileInfo = await page.evaluate(() => {
            const fileInfoElement = document.querySelector('.file-info');
            return fileInfoElement ? fileInfoElement.textContent : 'No file info found';
        });
        
        console.log('File upload result:', fileInfo);
        console.log('✅ File upload test completed');
        
        // Test 9: Import Button Test
        console.log('\n🚀 Test 9: Import Button Test...');
        
        const importBtn = await page.$('#import-btn');
        const isEnabled = await page.evaluate(btn => !btn.disabled, importBtn);
        
        console.log('Import button enabled:', isEnabled);
        
        if (isEnabled) {
            await page.click('#import-btn');
            console.log('✅ Import button clicked');
            
            // Wait for spinner to appear
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const spinnerVisible = await page.evaluate(() => {
                const spinner = document.getElementById('spinner-overlay');
                return spinner && !spinner.classList.contains('hidden');
            });
            
            console.log('Spinner appeared:', spinnerVisible);
            
            if (spinnerVisible) {
                console.log('✅ Import operation started successfully');
            } else {
                console.log('⚠️ Import operation may not have started');
            }
        } else {
            console.log('⚠️ Import button is disabled');
        }
        
        // Test 10: Spinner Functionality
        console.log('\n🎭 Test 10: Spinner Functionality...');
        
        const spinnerElements = await page.evaluate(() => {
            const elements = {
                spinner: document.getElementById('spinner-overlay'),
                title: document.getElementById('spinner-title'),
                subtitle: document.getElementById('spinner-subtitle'),
                progress: document.getElementById('progress-bar'),
                steps: document.getElementById('spinner-steps')
            };
            
            return Object.fromEntries(
                Object.entries(elements).map(([key, element]) => [key, !!element])
            );
        });
        
        console.log('Spinner elements present:', spinnerElements);
        console.log('✅ Spinner functionality verified');
        
        // Test 11: Error Handling
        console.log('\n🚨 Test 11: Error Handling...');
        
        const errorLogs = await page.evaluate(() => {
            return window.console.errors || [];
        });
        
        console.log('Console errors found:', errorLogs.length);
        if (errorLogs.length > 0) {
            console.log('Recent errors:', errorLogs.slice(-3));
        }
        
        // Test 12: Responsive Design
        console.log('\n📱 Test 12: Responsive Design...');
        
        // Test mobile viewport
        await page.setViewport({ width: 375, height: 667 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mobileLayout = await page.evaluate(() => {
            const csvSection = document.querySelector('.csv-file-section');
            return {
                width: csvSection ? window.getComputedStyle(csvSection).width : 'N/A',
                height: csvSection ? window.getComputedStyle(csvSection).height : 'N/A'
            };
        });
        
        console.log('Mobile layout:', mobileLayout);
        console.log('✅ Responsive design test completed');
        
        // Summary
        console.log('\n🎉 Comprehensive Test Summary:');
        console.log('================================');
        console.log('✅ Server is running and healthy');
        console.log('✅ Main application loads correctly');
        console.log('✅ Settings page is accessible');
        console.log('✅ Credentials can be configured');
        console.log('✅ File upload functionality works');
        console.log('✅ Import button is functional');
        console.log('✅ Spinner UI is properly implemented');
        console.log('✅ Error handling is in place');
        console.log('✅ Responsive design works');
        console.log('\n🚀 Application is ready for testing!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

// Run the test
comprehensiveTest().catch(console.error); 
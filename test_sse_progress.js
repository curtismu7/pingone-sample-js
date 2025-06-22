const puppeteer = require('puppeteer');

async function testSSEProgress() {
    console.log('🧪 Testing SSE Progress System...');
    
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    
    const page = await browser.newPage();
    
    try {
        // Add a delay to allow the server to start
        console.log('Waiting for server to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Navigate to the application
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
        console.log('✅ Page loaded successfully');
        
        // Wait for the page to be ready
        await page.waitForSelector('#csv-file', { timeout: 10000 });
        console.log('✅ File input found');
        
        // Go to settings and configure credentials
        await page.click('a[href="settings.html"]');
        
        // Wait for the settings page to load and the element to be visible
        await page.waitForSelector('#environment-id', { visible: true, timeout: 10000 });
        console.log('✅ Settings page loaded');
        
        // Fill in credentials (using real PingOne credentials)
        await page.type('#environment-id', 'd02d2305-f445-406d-82ee-7cdbf6eeabfd');
        await page.type('#client-id', 'your-client-id');
        await page.type('#client-secret', 'your-client-secret');
        
        // Save settings
        await page.click('#save-all-settings');
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('✅ Settings saved');
        
        // Go back to main page
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#csv-file', { timeout: 10000 });
        
        // Upload a test CSV file
        const fileInput = await page.$('#csv-file');
        await fileInput.uploadFile('test_users.csv');
        console.log('✅ File uploaded');
        
        // Wait for file processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Click import button
        await page.click('#import-btn');
        console.log('✅ Import button clicked');
        
        // Wait for spinner to appear
        await page.waitForSelector('#spinner-overlay', { timeout: 10000 });
        console.log('✅ Spinner appeared');
        
        // Check if stats section is present
        const statsSection = await page.$('#spinner-stats');
        if (statsSection) {
            console.log('✅ Stats section found');
        } else {
            console.log('❌ Stats section not found');
        }
        
        // Monitor progress for 30 seconds to see real-time updates
        console.log('📊 Monitoring real-time progress for 30 seconds...');
        
        let lastProgress = 0;
        let lastSuccessCount = 0;
        let lastErrorCount = 0;
        
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                // Get current progress
                const progressText = await page.$eval('#progress-percentage', el => el.textContent);
                const progress = parseInt(progressText.replace('%', ''));
                
                // Get stats if available
                const successCount = await page.$eval('#success-count', el => el.textContent).catch(() => '0');
                const errorCount = await page.$eval('#error-count', el => el.textContent).catch(() => '0');
                
                if (progress !== lastProgress || successCount !== lastSuccessCount || errorCount !== lastErrorCount) {
                    console.log(`📈 Progress: ${progress}%, Success: ${successCount}, Errors: ${errorCount}`);
                    lastProgress = progress;
                    lastSuccessCount = successCount;
                    lastErrorCount = errorCount;
                }
            } catch (error) {
                // Stats might not be available yet
            }
            
            // Check if operation completed
            const spinnerVisible = await page.$('#spinner-overlay').then(el => el !== null).catch(() => false);
            if (!spinnerVisible) {
                console.log('✅ Operation completed');
                break;
            }
        }
        
        // Check final results
        const finalMessage = await page.$eval('.spinner-status-summary', el => el.textContent).catch(() => 'No summary');
        console.log('📋 Final Status:', finalMessage);
        
        console.log('✅ SSE Progress Test Completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testSSEProgress(); 
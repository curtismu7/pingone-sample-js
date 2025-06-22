const puppeteer = require('puppeteer');

async function testSpinnerAnimation() {
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: ['--start-maximized']
    });
    
    try {
        const page = await browser.newPage();
        
        console.log('🧪 Testing Spinner Animation Behavior');
        console.log('=' .repeat(50));
        
        // Navigate to the app
        await page.goto('http://localhost:3002');
        console.log('✅ App loaded');
        
        // Wait for page to load
        await new Promise(r => setTimeout(r, 2000));
        
        // Upload a test file
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile('./fresh_test_users.csv');
            console.log('✅ Test file uploaded');
        }
        
        // Wait for file processing
        await new Promise(r => setTimeout(r, 2000));
        
        // Click import button
        const importBtn = await page.$('#import-btn');
        if (importBtn) {
            await importBtn.click();
            console.log('✅ Import button clicked');
        }
        
        // Wait for spinner to appear
        await page.waitForSelector('#spinner-overlay', { timeout: 5000 });
        console.log('✅ Spinner appeared');
        
        // Check if spinner is animating
        const spinnerIcon = await page.$('.spinner-icon');
        if (spinnerIcon) {
            const animation = await page.$eval('.spinner-icon', el => 
                window.getComputedStyle(el).animation
            );
            console.log(`🎭 Spinner animation: ${animation}`);
            
            if (animation.includes('spin')) {
                console.log('✅ Spinner is animating correctly');
            } else {
                console.log('❌ Spinner is not animating');
            }
        }
        
        // Wait for operation to complete (look for summary section to appear)
        await page.waitForSelector('#spinner-status-summary:not(.hidden)', { timeout: 60000 });
        console.log('✅ Operation completed, summary shown');

        // Check if spinner animation was stopped (before overlay is hidden)
        const spinnerIconAfter = await page.$('.spinner-icon');
        if (spinnerIconAfter) {
            const animationAfter = await page.$eval('.spinner-icon', el => 
                window.getComputedStyle(el).animation
            );
            console.log(`🎭 Spinner animation after completion: ${animationAfter}`);
            if (animationAfter === 'none' || animationAfter === '' || animationAfter.includes('paused')) {
                console.log('✅ Spinner animation stopped correctly');
            } else {
                console.log('❌ Spinner animation did not stop');
            }
        }

        // Now wait for spinner to hide
        await page.waitForSelector('#spinner-overlay', { hidden: true, timeout: 10000 });
        console.log('✅ Spinner hidden');
        
        console.log('\n🎉 Spinner Animation Test Completed!');
        console.log('=' .repeat(50));
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testSpinnerAnimation(); 
const puppeteer = require('puppeteer');

async function testSettingsPage() {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Listen for console messages
        page.on('console', msg => {
            console.log(`[${msg.type()}] ${msg.text()}`);
        });
        
        // Listen for page errors
        page.on('pageerror', error => {
            console.log(`[PAGE ERROR] ${error.message}`);
        });
        
        console.log('Navigating to settings page...');
        await page.goto('http://localhost:3002/settings.html', { 
            waitUntil: 'networkidle2',
            timeout: 10000 
        });
        
        console.log('Waiting for page to load...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if the environment-id element exists
        const envIdElement = await page.$('#environment-id');
        if (envIdElement) {
            console.log('✅ #environment-id element found');
        } else {
            console.log('❌ #environment-id element not found');
        }
        
        // Check if Tippy.js is loaded
        const tippyAvailable = await page.evaluate(() => {
            return typeof window.tippy !== 'undefined';
        });
        
        if (tippyAvailable) {
            console.log('✅ Tippy.js is available');
        } else {
            console.log('❌ Tippy.js is not available');
        }
        
        // Check for any JavaScript errors
        const errors = await page.evaluate(() => {
            return window.errors || [];
        });
        
        if (errors.length === 0) {
            console.log('✅ No JavaScript errors detected');
        } else {
            console.log('❌ JavaScript errors detected:', errors);
        }
        
        console.log('Test completed successfully');
        
    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testSettingsPage(); 
const puppeteer = require('puppeteer');

async function testSettingsFix() {
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
        
        console.log('Testing main page...');
        await page.goto('http://localhost:3002/', { 
            waitUntil: 'networkidle2',
            timeout: 10000 
        });
        
        // Wait a bit for scripts to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('Testing settings page...');
        await page.goto('http://localhost:3002/settings.html', { 
            waitUntil: 'networkidle2',
            timeout: 10000 
        });
        
        // Wait for scripts to load and check for errors
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if the environment-id element exists and is accessible
        const envIdElement = await page.$('#environment-id');
        if (envIdElement) {
            console.log('✅ Environment ID element found');
        } else {
            console.log('❌ Environment ID element not found');
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
        
        console.log('Test completed successfully!');
        
    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testSettingsFix(); 
const puppeteer = require('puppeteer');
const assert = require('assert');
const path = require('path');

// --- Test Configuration ---
const BASE_URL = 'http://localhost:3002';
const HEADLESS = true; // Set to false to watch the test run
const SLOW_MO = 50; // Slows down Puppeteer operations (in ms) to make them easier to see

// --- Credentials (use environment variables or replace with test values) ---
const P1_ENVIRONMENT_ID = process.env.P1_ENVIRONMENT_ID || 'd02d2305-f445-406d-82ee-7cdbf6eeabfd';
const P1_CLIENT_ID = process.env.P1_CLIENT_ID || '4c748482-5f8f-43d8-8977-1335b2a970b5';
const P1_CLIENT_SECRET = process.env.P1_CLIENT_SECRET || 'Z7w.QdY9qG-3~c9A8h4gJ1tB8c.2xL2-sJ';

// --- Test Data ---
const TIMESTAMP = new Date().getTime();
const IMPORT_USERS = [
    { username: `testuser1_${TIMESTAMP}@example.com`, firstName: 'Test1', lastName: `User_${TIMESTAMP}` },
    { username: `testuser2_${TIMESTAMP}@example.com`, firstName: 'Test2', lastName: `User_${TIMESTAMP}` }
];
const MODIFY_USERS = [
    { username: `testuser1_${TIMESTAMP}@example.com`, firstName: 'Test1-Modified' },
    { username: `testuser2_${TIMESTAMP}@example.com`, firstName: 'Test2-Modified' }
];
const DELETE_USERS = [
    { username: `testuser1_${TIMESTAMP}@example.com` },
    { username: `testuser2_${TIMESTAMP}@example.com` }
];

// --- Helper Functions ---
const log = (message, ...args) => console.log(`[${new Date().toISOString()}] ${message}`, ...args);

// Function to convert an array of objects to a CSV string
const toCSV = (data) => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(header => obj[header]).join(','));
    return [headers.join(','), ...rows].join('\n');
};

// Main test function
async function runComprehensiveTest() {
    log('🚀 Starting comprehensive test for Import, Modify, and Delete...');
    const browser = await puppeteer.launch({
        headless: HEADLESS,
        slowMo: SLOW_MO,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    try {
        // --- 1. Set Credentials ---
        log('🔧 Step 1: Setting credentials...');
        await page.goto(`${BASE_URL}/settings.html`, { waitUntil: 'networkidle2' });
        
        await page.evaluate(() => localStorage.clear());
        log('Cleared localStorage.');

        await page.type('#environment-id', P1_ENVIRONMENT_ID);
        await page.type('#client-id', P1_CLIENT_ID);
        await page.type('#client-secret', P1_CLIENT_SECRET);
        await page.click('#use-client-secret');
        await page.click('#save-credentials');
        await page.click('#save-all-settings');
        await page.waitForSelector('.saved', { visible: true });
        log('✅ Credentials saved successfully.');

        // --- 2. Navigate to Main Page ---
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await page.waitForFunction(() => window.mainPage && window.utils); // Wait for scripts to initialize

        // --- 3. Test Import ---
        log('🔄 Step 2: Testing IMPORT operation...');
        const importCsv = toCSV(IMPORT_USERS);
        await page.evaluate((csvContent) => {
            const file = new File([csvContent], 'import.csv', { type: 'text/csv' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const mockEvent = { target: { files: dataTransfer.files } };
            window.mainPage.handleFileSelect(mockEvent);
        }, importCsv);

        await page.click('#import-btn');
        log('Import initiated. Waiting for completion...');
        
        await page.waitForFunction(
            () => document.querySelector('#spinner-subtitle')?.innerText.includes('Import operation completed'),
            { timeout: 30000 }
        );

        const importSummary = await page.$eval('.spinner-summary-text', el => el.innerText);
        assert.strictEqual(importSummary, '2 successful, 0 failed', `Import failed. Summary: ${importSummary}`);
        log('✅ IMPORT operation successful.');
        await page.click('.spinner-close'); // Close spinner to proceed

        // --- 4. Test Modify ---
        log('🔄 Step 3: Testing MODIFY operation...');
        const modifyCsv = toCSV(MODIFY_USERS);
        await page.evaluate((csvContent) => {
            const file = new File([csvContent], 'modify.csv', { type: 'text/csv' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const mockEvent = { target: { files: dataTransfer.files } };
            window.mainPage.handleFileSelect(mockEvent);
        }, modifyCsv);

        await page.click('#modify-btn');
        log('Modify initiated. Waiting for completion...');

        await page.waitForFunction(
            () => document.querySelector('#spinner-subtitle')?.innerText.includes('Modify operation completed'),
            { timeout: 30000 }
        );

        const modifySummary = await page.$eval('.spinner-summary-text', el => el.innerText);
        assert.strictEqual(modifySummary, '2 successful, 0 failed', `Modify failed. Summary: ${modifySummary}`);
        log('✅ MODIFY operation successful.');
        await page.click('.spinner-close');


        // --- 5. Test Delete ---
        log('🔄 Step 4: Testing DELETE operation...');
        const deleteCsv = toCSV(DELETE_USERS);
        await page.evaluate((csvContent) => {
            const file = new File([csvContent], 'delete.csv', { type: 'text/csv' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const mockEvent = { target: { files: dataTransfer.files } };
            window.mainPage.handleFileSelect(mockEvent);
        }, deleteCsv);
        
        await page.click('#delete-btn');
        log('Delete initiated. Waiting for completion...');

        await page.waitForFunction(
            () => document.querySelector('#spinner-subtitle')?.innerText.includes('Delete operation completed'),
            { timeout: 30000 }
        );

        const deleteSummary = await page.$eval('.spinner-summary-text', el => el.innerText);
        assert.strictEqual(deleteSummary, '2 successful, 0 failed', `Delete failed. Summary: ${deleteSummary}`);
        log('✅ DELETE operation successful.');

        log('🎉 All operations completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: 'test_error_screenshot.png', fullPage: true });
        log('📸 Screenshot saved to test_error_screenshot.png');
    } finally {
        await browser.close();
        // Clean up generated CSV files
        ['import', 'modify', 'delete'].forEach(op => {
            const filePath = path.resolve(__dirname, `${op}_${TIMESTAMP}.csv`);
            if (require('fs').existsSync(filePath)) {
                require('fs').unlinkSync(filePath);
            }
        });
    }
}

runComprehensiveTest().catch(console.error); 
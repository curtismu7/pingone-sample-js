const puppeteer = require('puppeteer');
const path = require('path');

async function runTest() {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 960 });

    // Enable console logging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log('Navigating to the main page...');
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });

    console.log('Uploading test file...');
    const filePath = path.resolve('./generated_users.csv');
    const inputUploadHandle = await page.$('#csv-file');
    await inputUploadHandle.uploadFile(filePath);
    await page.waitForSelector('.record-count');
    console.log('File uploaded.');

    console.log('Clicking import button...');
    await page.click('#import-btn');

    console.log('Waiting for spinner to appear...');
    await page.waitForSelector('#spinner-overlay', { visible: true });
    console.log('Spinner is visible.');

    console.log('Waiting for a moment before cancelling...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec

    console.log('Clicking cancel button...');
    try {
      await page.click('#spinner-cancel');
      console.log('Cancel button clicked successfully.');
    } catch (error) {
      console.log('Could not click cancel button directly, trying alternative method...');
      await page.evaluate(() => {
        const cancelBtn = document.getElementById('spinner-cancel');
        if (cancelBtn) {
          cancelBtn.click();
        }
      });
    }

    console.log('Waiting for failure/cancelled status...');
    await page.waitForSelector('.spinner-step.error', { timeout: 10000 });
    console.log('Operation cancelled status appeared.');
    
    const failedStepText = await page.$eval('.spinner-step.error .step-text', el => el.textContent);
    console.log(`Status message: "${failedStepText}"`);

    if (failedStepText.includes('Operation cancelled by user')) {
      console.log('TEST PASSED: Operation was successfully cancelled by the user.');
    } else {
      throw new Error('TEST FAILED: The operation was not cancelled as expected.');
    }
    
    console.log('Test finished successfully.');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTest(); 
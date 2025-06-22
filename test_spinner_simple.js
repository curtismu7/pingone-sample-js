const puppeteer = require('puppeteer');
const path = require('path');

async function runTest() {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
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
    const fileInput = await page.$('#csv-file');
    await fileInput.uploadFile(filePath);
    console.log('File uploaded.');

    // Wait for file to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Manually triggering spinner...');
    await page.evaluate(() => {
      if (window.utils) {
        window.utils.showOperationSpinner('Test Import Operation', 'generated_users.csv', 'User Import', 100);
      }
    });

    console.log('Waiting for spinner to appear...');
    await page.waitForSelector('#spinner-overlay:not(.hidden)', { timeout: 10000 });
    console.log('Spinner appeared!');

    // Wait a moment for spinner to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Clicking cancel button...');
    await page.evaluate(() => {
      const cancelBtn = document.getElementById('spinner-cancel');
      if (cancelBtn) {
        cancelBtn.click();
      }
    });

    console.log('Waiting for cancellation...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if spinner shows cancelled status
    const result = await page.evaluate(() => {
      // Check multiple possible error indicators
      const errorSteps = document.querySelectorAll('.spinner-step.error');
      const failedSteps = document.querySelectorAll('.spinner-step.failed');
      const summaryError = document.querySelector('.summary-value.error');
      
      console.log('Error steps found:', errorSteps.length);
      console.log('Failed steps found:', failedSteps.length);
      console.log('Summary error found:', !!summaryError);
      
      // Check if spinner is still visible
      const spinner = document.getElementById('spinner-overlay');
      const isVisible = spinner && !spinner.classList.contains('hidden');
      console.log('Spinner still visible:', isVisible);
      
      return {
        hasErrorSteps: errorSteps.length > 0,
        hasFailedSteps: failedSteps.length > 0,
        hasSummaryError: !!summaryError,
        spinnerVisible: isVisible,
        errorText: summaryError ? summaryError.textContent : null
      };
    });

    console.log('Test result:', result);

    if (result.hasSummaryError || result.hasErrorSteps || result.hasFailedSteps) {
      console.log('✅ TEST PASSED: Operation was successfully cancelled!');
      console.log('Error status detected:', result);
    } else {
      console.log('❌ TEST FAILED: Operation was not cancelled properly.');
    }

    // Keep browser open for inspection
    console.log('Keeping browser open for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTest(); 
const puppeteer = require('puppeteer');

async function runTest() {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false, // Use false to see what's happening
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 960 });

    // Enable console logging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log('Navigating to the main page...');
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle2' });

    console.log('Checking if spinner elements exist...');
    
    // Check if spinner elements exist
    const spinnerOverlay = await page.$('#spinner-overlay');
    const spinnerContainer = await page.$('.spinner-container');
    const cancelButton = await page.$('#spinner-cancel');
    
    console.log('Spinner overlay exists:', !!spinnerOverlay);
    console.log('Spinner container exists:', !!spinnerContainer);
    console.log('Cancel button exists:', !!cancelButton);

    // Try to manually trigger the spinner
    console.log('Attempting to manually show spinner...');
    await page.evaluate(() => {
      if (window.utils) {
        console.log('Utils found, showing spinner...');
        window.utils.showOperationSpinner('Test Operation', 'test.csv', 'Test Import', 10);
      } else {
        console.log('Utils not found!');
      }
    });

    // Wait a moment and check if spinner is visible
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const isSpinnerVisible = await page.evaluate(() => {
      const overlay = document.getElementById('spinner-overlay');
      return overlay && overlay.style.display !== 'none';
    });
    
    console.log('Spinner is visible:', isSpinnerVisible);

    if (isSpinnerVisible) {
      console.log('SUCCESS: Spinner is working!');
      
      // Try to click cancel button
      console.log('Attempting to click cancel button...');
      await page.click('#spinner-cancel');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const isSpinnerStillVisible = await page.evaluate(() => {
        const overlay = document.getElementById('spinner-overlay');
        return overlay && overlay.style.display !== 'none';
      });
      
      console.log('Spinner still visible after cancel:', isSpinnerStillVisible);
    } else {
      console.log('FAILED: Spinner is not visible');
    }

    // Keep browser open for manual inspection
    console.log('Keeping browser open for 10 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTest(); 
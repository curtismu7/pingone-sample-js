const puppeteer = require('puppeteer');

async function testSimpleCompletion() {
    console.log('🧪 Testing Simple Spinner Completion Behavior\n');
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: { width: 1200, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Navigate to the application
        console.log('📱 Loading application...');
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle0' });
        
        // Wait for the page to load
        await page.waitForSelector('.csv-file-section', { timeout: 10000 });
        console.log('✅ Application loaded successfully');
        
        // Test 1: Manually show the spinner
        console.log('\n🎭 Test 1: Manually showing spinner...');
        await page.evaluate(() => {
            // Show the spinner manually
            const spinner = document.getElementById('spinner-overlay');
            if (spinner) {
                spinner.classList.remove('hidden');
                console.log('Spinner shown manually');
            }
            
            // Set some test content
            const title = document.getElementById('spinner-title');
            const subtitle = document.getElementById('spinner-subtitle');
            if (title) title.textContent = 'Test Operation';
            if (subtitle) subtitle.textContent = 'Testing completion behavior...';
            
            // Show the close button
            const footerBtn = document.getElementById('spinner-footer-btn-container');
            if (footerBtn) {
                footerBtn.classList.remove('hidden');
                console.log('Close button shown');
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ Spinner shown manually');
        
        // Test 2: Check if close button is visible and clickable
        console.log('\n🔍 Test 2: Checking close button...');
        const buttonState = await page.evaluate(() => {
            const closeBtn = document.getElementById('spinner-close');
            const footerBtn = document.getElementById('spinner-footer-btn-container');
            
            return {
                closeBtnExists: !!closeBtn,
                closeBtnVisible: closeBtn && !closeBtn.classList.contains('hidden'),
                footerBtnVisible: footerBtn && !footerBtn.classList.contains('hidden'),
                closeBtnText: closeBtn ? closeBtn.textContent : 'No button',
                closeBtnDisabled: closeBtn ? closeBtn.disabled : true
            };
        });
        
        console.log('Button state:', buttonState);
        
        // Test 3: Try to click the close button
        console.log('\n🔘 Test 3: Attempting to click close button...');
        try {
            await page.click('#spinner-close');
            console.log('✅ Close button clicked successfully');
        } catch (error) {
            console.log('⚠️ Could not click close button:', error.message);
            
            // Try alternative approach - trigger the click event
            console.log('\n🔄 Test 3b: Triggering click event...');
            await page.evaluate(() => {
                const closeBtn = document.getElementById('spinner-close');
                if (closeBtn) {
                    closeBtn.click();
                    console.log('Click event triggered');
                }
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 4: Verify completion behavior
        console.log('\n✅ Test 4: Verifying completion behavior...');
        const completionState = await page.evaluate(() => {
            // Check if spinner is hidden
            const spinner = document.getElementById('spinner-overlay');
            const spinnerHidden = spinner && spinner.classList.contains('hidden');
            
            // Check if any modals are visible
            const modal = document.getElementById('modal');
            const modalVisible = modal && !modal.classList.contains('hidden');
            
            // Check if results panel is visible
            const resultsPanel = document.getElementById('results-panel');
            const resultsVisible = resultsPanel && !resultsPanel.classList.contains('hidden');
            
            // Check if any error messages are visible
            const errorElements = document.querySelectorAll('.error-details, .error-message, .alert-error');
            const errorVisible = Array.from(errorElements).some(el => !el.classList.contains('hidden'));
            
            return {
                spinnerHidden,
                modalVisible,
                resultsVisible,
                errorVisible
            };
        });
        
        console.log('Completion state:', completionState);
        
        // Test 5: Manually trigger completion functions
        console.log('\n🔧 Test 5: Manually triggering completion functions...');
        await page.evaluate(() => {
            if (window.utils) {
                console.log('Utils available, triggering completion...');
                window.utils.handleSpinnerCompletion();
            } else {
                console.log('Utils not available');
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 6: Final verification
        console.log('\n🎯 Test 6: Final verification...');
        const finalState = await page.evaluate(() => {
            const spinner = document.getElementById('spinner-overlay');
            const modal = document.getElementById('modal');
            const resultsPanel = document.getElementById('results-panel');
            
            return {
                spinnerHidden: spinner && spinner.classList.contains('hidden'),
                modalVisible: modal && !modal.classList.contains('hidden'),
                resultsVisible: resultsPanel && !resultsPanel.classList.contains('hidden'),
                scrollY: window.scrollY
            };
        });
        
        console.log('Final state:', finalState);
        
        // Summary
        console.log('\n🎉 Simple Completion Test Summary:');
        console.log('===================================');
        console.log(`✅ Spinner hidden: ${finalState.spinnerHidden}`);
        console.log(`✅ No modals visible: ${!finalState.modalVisible}`);
        console.log(`✅ Results panel visible: ${finalState.resultsVisible}`);
        console.log(`✅ Scroll position: ${finalState.scrollY}`);
        
        if (finalState.spinnerHidden && !finalState.modalVisible) {
            console.log('\n🚀 SUCCESS: Completion behavior works correctly!');
        } else {
            console.log('\n⚠️ ISSUES FOUND: Some completion behaviors need attention');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

// Run the test
testSimpleCompletion().catch(console.error); 
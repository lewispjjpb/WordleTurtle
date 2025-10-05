// Content script - handles DOM interaction
(function() {
    'use strict';
    
    let observer = null;
    let lastCheckedWord = '';
    let isApiCallInProgress = false;
    let isObservingActive = false;

    function getCurrentWord() {
        console.log('Looking for current word...');

        // Find all tiles with tbd state (these are only in the active row)
        const tbdTiles = document.querySelectorAll('.Tile-module_tile__UWEHN[data-state="tbd"]');
        console.log(`Found ${tbdTiles.length} TBD tiles`);

        // If we don't have exactly 5 TBD tiles, there's no complete word to check
        if (tbdTiles.length !== 5) {
            console.log(`Expected 5 TBD tiles, found ${tbdTiles.length}`);
            return null;
        }

        // Extract letters from the tiles
        let word = '';
        for (let i = 0; i < tbdTiles.length; i++) {
            console.debug(`Checking TBD tile ${i}`);
            const letter = tbdTiles[i].textContent.trim();
            console.log(`TBD Tile ${i}: letter="${letter}"`);

            if (letter) {
                word += letter.toLowerCase();
            } else {
                // If any tile is empty, we don't have a complete word
                console.log(`Tile ${i} is empty, word incomplete`);
                return null;
            }
        }

        console.log(`Complete word found: ${word}`);
        return word;
    }

    // Parse word list from HTML
    function parseWordListFromHTML(htmlText) {
        try {
            console.log('Parsing word list from HTML...');
            
            // Create a temporary div to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlText;
            
            // Find the alphalist div
            const alphaListDiv = tempDiv.querySelector('#alphalist');
            if (!alphaListDiv) {
                throw new Error('Could not find #alphalist element');
            }
            
            // Extract words from the div
            // Get all text content and split by <br> elements
            const innerHTML = alphaListDiv.innerHTML;
            const words = innerHTML
                .split(/<br\s*\/?>/i) // Split on <br> or <br/> tags (case insensitive)
                .map(word => word.trim()) // Remove whitespace
                .filter(word => word && word.length > 0) // Remove empty strings
                .map(word => word.toLowerCase().split(' ')[0]); // Convert to lowercase for consistency
            
            console.log(`Parsed ${words.length} words from HTML`);
            return { success: true, words: words };
            
        } catch (error) {
            console.error('Error parsing word list:', error);
            return { success: false, error: error.message };
        }
    }

    async function checkWordWithBackground(word) {
        console.debug(`Checking word: ${word}`);
        if (isApiCallInProgress || word === lastCheckedWord) {
            return;
        }
        isApiCallInProgress = true;
        lastCheckedWord = word;
        
        try {
            // Send message to background script to check the word
            const response = await chrome.runtime.sendMessage({
                action: 'checkWord',
                word: word
            });
            
            if (response && response.success) {
                console.debug({response})
                handleAPIResponse(word, response.data);
            } else {
                handleAPIError(word, response ? response.error : 'Unknown error');
            }
            
        } catch (error) {
            console.error('Error communicating with background script:', error);
            handleAPIError(word, 'Communication error');
        } finally {
            isApiCallInProgress = false;
        }
    }
    
    function handleAPIResponse(word, data) {
        console.log(`API Response for "${word}":`, data);
        
        // Only care about whether the word has been used before
        if (data.used === true) {
            // Word has been used before - apply warning styling
            applySpecialStyling(word, 'used');
            showUserFeedback(`"${word.toUpperCase()}" has been used before!`, 'warning');
        } else {
            // Word hasn't been used before - no special styling
            removeSpecialStyling();
            showUserFeedback(`"${word.toUpperCase()}" looks good!`, 'success');
        }
    }
    
    function handleAPIError(word, error) {
        console.error(`Failed to check word "${word}":`, error);
        removeSpecialStyling();
        showUserFeedback('Unable to verify word', 'error');
    }
    
    function applySpecialStyling(word, status) {
        removeSpecialStyling();
        document.body.classList.add('wordle-turtle-active');
        document.body.setAttribute('data-wordle-word', word);
        document.body.setAttribute('data-wordle-status', status);
        console.log(`Special styling applied for word: ${word} (${status})`);
    }
    
    function removeSpecialStyling() {
        document.body.classList.remove('wordle-turtle-active');
        document.body.removeAttribute('data-wordle-word');
        document.body.removeAttribute('data-wordle-status');
    }
    
    function showUserFeedback(message, type = 'info') {
        let feedbackEl = document.getElementById('wordle-turtle-feedback');
        
        if (!feedbackEl) {
            feedbackEl = document.createElement('div');
            feedbackEl.id = 'wordle-turtle-feedback';
            feedbackEl.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                z-index: 10000;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                max-width: 300px;
                text-align: center;
            `;
            document.body.appendChild(feedbackEl);
        }
        
        const colors = {
            success: '#22c55e',
            warning: '#f59e0b',
            error: '#ef4444',
            info: '#3b82f6'
        };
        
        feedbackEl.textContent = message;
        feedbackEl.style.background = colors[type] || colors.info;
        feedbackEl.style.opacity = '1';
        feedbackEl.style.transform = 'translateX(-50%) translateY(0)';
        
        clearTimeout(feedbackEl.hideTimeout);
        feedbackEl.hideTimeout = setTimeout(() => {
            if (feedbackEl) {
                feedbackEl.style.opacity = '0';
                feedbackEl.style.transform = 'translateX(-50%) translateY(-10px)';
                setTimeout(() => {
                    if (feedbackEl && feedbackEl.parentNode) {
                        feedbackEl.parentNode.removeChild(feedbackEl);
                    }
                }, 300);
            }
        }, 4000);
    }
    
    function checkWordleState() {
        console.debug('Checking Wordle state ', isObservingActive);
        if (!isObservingActive) return;
        const currentWord = getCurrentWord();
        console.debug('Wordle state is active ', currentWord);

        if (currentWord && currentWord.length === 5) {
            if (currentWord !== lastCheckedWord) {
                checkWordWithBackground(currentWord);
            }
        } else {
            if (lastCheckedWord) {
                removeSpecialStyling();
                lastCheckedWord = '';
                const feedbackEl = document.getElementById('wordle-turtle-feedback');
                if (feedbackEl) {
                    feedbackEl.style.opacity = '0';
                }
            }
        }
    }
    
    function startObserver() {
        console.debug('Starting Wordle Turtle observerrrrr');
        if (observer) {
            observer.disconnect();
        }
        
        isObservingActive = true;
        
        const gameArea = document.querySelector('.App-module_game__yruqo') || 
                        document.querySelector('[role="img"]') || 
                        document.querySelector('game-app') ||
                        document.body;
        
        observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || 
                    mutation.type === 'characterData' || 
                    (mutation.type === 'attributes' && mutation.attributeName === 'data-state')) {
                    shouldCheck = true;
                }
            });
            
            if (shouldCheck) {
                clearTimeout(checkWordleState.timeoutId);
                checkWordleState.timeoutId = setTimeout(checkWordleState, 500);
            }
        });
        
        observer.observe(gameArea, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-state']
        });
        
        console.log('Wordle Turtle observer started');
        showUserFeedback('Wordle Turtle is now active!', 'success');
        
        // Check immediately for existing state
        setTimeout(checkWordleState, 500);
    }
    
    function stopObserver() {
        isObservingActive = false;
        
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        
        // Clean up styling and state
        removeSpecialStyling();
        lastCheckedWord = '';
        
        console.log('Wordle Turtle observer stopped');
        showUserFeedback('Wordle Turtle is now inactive', 'info');
    }
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            if (message.action === 'startObserving') {
                startObserver();
                sendResponse({ success: true });
            } else if (message.action === 'stopObserving') {
                stopObserver();
                sendResponse({ success: true });
            } else if (message.action === 'parseWordListHTML') {
                // Background script is asking us to parse HTML
                const result = parseWordListFromHTML(message.html);
                sendResponse(result);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    });
    
    // Notify background script that content script is ready
    try {
        chrome.runtime.sendMessage({ action: 'contentScriptReady' });
    } catch (error) {
        // Background script might not be ready yet, that's okay
    }
    
    console.log('Wordle Turtle content script loaded');
})();
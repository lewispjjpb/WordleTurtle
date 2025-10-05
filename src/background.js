// Background script - handles the extension button and messaging
let isObserving = false;
let wordList = null; // Cache the word list
let isLoadingWords = false;

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    try {
        // Check if the current tab is a Wordle page
        if (!tab.url.includes('nytimes.com')) {
            console.log('Not on a supported Wordle page');
            chrome.action.setBadgeText({ text: "N/A" });
            chrome.action.setBadgeBackgroundColor({ color: "#666666" });
            return;
        }
        
        // Toggle the observing state
        isObserving = !isObserving;
        
        // Update badge to show current state
        chrome.action.setBadgeText({
            text: isObserving ? "ON" : "OFF"
        });
        
        chrome.action.setBadgeBackgroundColor({
            color: isObserving ? "#22c55e" : "#ef4444"
        });
        
        try {
            // Send message to content script to start/stop observing
            await chrome.tabs.sendMessage(tab.id, {
                action: isObserving ? 'startObserving' : 'stopObserving'
            });
            
            console.log(isObserving ? 'Started observing Wordle' : 'Stopped observing Wordle');
            
        } catch (messageError) {
            console.error('Failed to communicate with content script:', messageError);
            
            // Try to inject the content script if it's not already there
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['src/content.js']
                });
                
                // Try sending the message again after a short delay
                setTimeout(async () => {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            action: isObserving ? 'startObserving' : 'stopObserving'
                        });
                        console.log('Successfully communicated after script injection');
                    } catch (retryError) {
                        console.error('Still failed to communicate after injection:', retryError);
                        // Reset state since we couldn't activate
                        isObserving = false;
                        chrome.action.setBadgeText({ text: "ERR" });
                        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
                    }
                }, 100);
                
            } catch (injectionError) {
                console.error('Failed to inject content script:', injectionError);
                // Reset state since we couldn't activate
                isObserving = false;
                chrome.action.setBadgeText({ text: "ERR" });
                chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
            }
        }
        
    } catch (error) {
        console.error('Error toggling observer:', error);
        isObserving = false;
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug('Received message from content script:', message);
    
    if (message.action === 'checkWord') {
        handleWordCheck(message.word, sender.tab.id)
            .then(result => {
                console.debug('Sending response to content script:', result);
                return sendResponse(result)
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
        
    } else if (message.action === 'parseWordList') {
        // Content script is asking us to parse HTML
        parseWordListFromHTML(message.html)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// Handle word checking workflow
async function handleWordCheck(word, tabId) {
    try {
        console.log(`Checking word: ${word}`);
        
        // If we don't have the word list yet, we need to load it
        if (!wordList && !isLoadingWords) {
            isLoadingWords = true;
            
            try {
                // Fetch the HTML
                const response = await fetch('https://www.fiveforks.com/wordle', {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch word list: ${response.status}`);
                }
                
                const htmlText = await response.text();
                console.log('HTML fetched, sending to content script for parsing...');
                
                // Send HTML to content script for parsing
                const parseResult = await chrome.tabs.sendMessage(tabId, {
                    action: 'parseWordListHTML',
                    html: htmlText
                });
                
                if (parseResult && parseResult.success) {
                    wordList = new Set(parseResult.words);
                    console.log(`Loaded ${wordList.size} previously used Wordle answers`);
                } else {
                    throw new Error(parseResult ? parseResult.error : 'Failed to parse word list');
                }
                
            } finally {
                isLoadingWords = false;
            }
        }
        
        // Wait for word list to be loaded if another request is loading it
        while (isLoadingWords) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (!wordList) {
            return { 
                success: false, 
                error: 'Word list not available',
                data: { used: false }
            };
        }
        
        // Check if word has been used as a previous Wordle answer
        const wasUsed = wordList.has(word.toLowerCase());
        console.debug({word, wordList, wasUsed});
        console.log(`Word "${word}" ${wasUsed ? 'has been used before' : 'has not been used before'}`);
        
        return {
            success: true,
            data: {
                used: wasUsed,
                word: word
            }
        };
        
    } catch (error) {
        console.error('Error checking word:', error);
        return { 
            success: false, 
            error: error.message,
            data: { used: false },
            word: word 
        };
    }
}

// Reset badge when tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && !tab.url.includes('nytimes.com')) {
            chrome.action.setBadgeText({ text: "N/A" });
            chrome.action.setBadgeBackgroundColor({ color: "#666666" });
            isObserving = false;
        }
    } catch (error) {
        // Ignore errors when getting tab info
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "OFF"
    });
    chrome.action.setBadgeBackgroundColor({
        color: "#ef4444"
    });
});
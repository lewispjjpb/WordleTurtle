const extensions = 'https://developer.chrome.com/docs/extensions';
const webstore = 'https://developer.chrome.com/docs/webstore';
const wordle = 'https://www.nytimes.com/games/wordle'


chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "OFF",
    });
});

chrome.action.onClicked.addListener(async (tab) => {
    let nextState = 'OFF'; // Initialize with default value
    
    if (tab.url.startsWith(wordle)) {
        // Retrieve the action badge to check if the extension is 'ON' or 'OFF'
        const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
        // Next state will always be the opposite
        nextState = prevState === 'ON' ? 'OFF' : 'ON';

        // Set the action badge to the next state
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: nextState,
        });
    }
    
    if (nextState === "ON") {
        // Insert the CSS file when the user turns the extension on
        await startObserver(tab)
    } else if (nextState === "OFF") {
        // Remove the CSS file when the user turns the extension off
        await removeSpecialStyling(tab)
    }
});


// Set up the MutationObserver
function startObserver() {
    const gameArea = document.querySelector('.App-module_game__yruqo') ||
        document.querySelector('[role="img"]') ||
        document.querySelector('game-app') ||
        document.body;

    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;

        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' ||
                mutation.type === 'characterData' ||
                (mutation.type === 'attributes' && mutation.attributeName === 'data-state')) {
                shouldCheck = true;
            }
        });

        if (shouldCheck) {
            // Use debouncing to avoid too many API calls
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
}

// Check for filled tiles in the current row
function checkWordleState() {
    const currentWord = getCurrentWord();

    if (currentWord && currentWord.length === 5) {
        // Only make API call if this is a new word
        if (currentWord !== lastCheckedWord) {
            checkWordWithAPI(currentWord);
        }
    } else {
        // If no 5-letter word is present, remove styling and reset
        if (lastCheckedWord) {
            removeSpecialStyling();
            lastCheckedWord = '';
            // Clear any feedback
            const feedbackEl = document.getElementById('wordle-turtle-feedback');
            if (feedbackEl) {
                feedbackEl.style.opacity = '0';
            }
        }
    }
}


async function checkWordWithAPI(word) {
    if (isApiCallInProgress || word === lastCheckedWord) {
        return;
    }

    let isApiCallInProgress = true;
    let lastCheckedWord = word;

    try {
        console.log(`Checking word: ${word}`);

        // Replace with your actual API endpoint
        const response = await fetch(`https://wordle-list.malted.dev/valid`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Add any authentication headers if needed
                // 'Authorization': 'Bearer YOUR_TOKEN'
            },
            query: JSON.stringify({
                word: word,
                // Add any other data you need to send
            })
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('API response:', data);

        // Process the API response and apply styling based on condition
        handleAPIResponse(word, data);

    } catch (error) {
        console.error('Error calling API:', error);
        // Handle error (maybe show user feedback)
        handleAPIError(word, error);
    } finally {
        isApiCallInProgress = false;
    }
}

function getCurrentWord() {
    // Find the current active row
    const rows = document.querySelectorAll('[data-testid="row"]');

    for (let row of rows) {
        const tiles = row.querySelectorAll('[data-testid="tile"]');
        let word = '';
        let isCurrentRow = false;

        // Check if this row has letters but hasn't been evaluated
        for (let tile of tiles) {
            const state = tile.getAttribute('data-state');
            const letter = tile.textContent.trim();

            if (letter) {
                word += letter.toLowerCase();
            }

            // If any tile is evaluated (correct/present/absent), this isn't the current row
            if (state === 'correct' || state === 'present' || state === 'absent') {
                break;
            }

            // If we have letters but no evaluation, this is the current row
            if (letter && (state === 'empty' || state === 'tbd' || !state)) {
                isCurrentRow = true;
            }
        }

        // Return the word if it's the current row and has exactly 5 letters
        if (isCurrentRow && word.length === 5) {
            return word;
        }
    }

    return null;
}

function handleAPIResponse(word, data) {
    // Example: Check if the word meets your criteria
    if (data.shouldHighlight || data.isSpecialWord || data.meetsCriteria) {
        applySpecialStyling(word, data);
    } else {
        removeSpecialStyling();
    }

    // You could also show additional UI feedback
    if (data.message) {
        showUserFeedback(data.message);
    }
}

async function applySpecialStyling(tab) {
    await chrome.scripting.insertCSS({
        files: ["src/highlight-mode.css"],
        target: { tabId: tab.id },
    });
}

async function removeSpecialStyling(tab) {
    await chrome.scripting.removeCSS({
        files: ["src/highlight-mode.css"],
        target: { tabId: tab.id },
    })
}


function handleAPIError(word, error) {
    console.error(`Failed to check word "${word}":`, error);
    // Maybe show a subtle error indicator to the user
    showUserFeedback('Unable to check word', 'error');
}

function showUserFeedback(message, type = 'success') {
    // Example: Show a toast notification
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.classList.add(type);
    toast.textContent = message;
    document.body.appendChild(toast);
}
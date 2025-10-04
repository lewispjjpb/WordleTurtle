const extensions = 'https://developer.chrome.com/docs/extensions';
const webstore = 'https://developer.chrome.com/docs/webstore';
const wordle = 'https://www.nytimes.com/games/wordle'

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');

    // Add error handling
    if (chrome.action) {
        chrome.action.setBadgeText({
            text: "OFF",
        });
        console.log('Badge text set to OFF');
    } else {
        console.error('chrome.action is not available');
    }
});


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
        await applySpecialStyling(tab)
    } else if (nextState === "OFF") {
        // Remove the CSS file when the user turns the extension off
        await removeSpecialStyling(tab)
    }
});

// Check for filled tiles in the current row
function checkWordleState() {
    // Look for the current row (active row)
    const gameRows = document.querySelectorAll('[data-state]');
    const currentRow = Array.from(gameRows).find(row => {
        const tiles = row.querySelectorAll('[data-state]');
        return tiles.length > 0 && tiles[0].getAttribute('data-state') === 'empty';
    });

    if (currentRow) {
        const tiles = currentRow.querySelectorAll('[data-state]');
        const filledTiles = Array.from(tiles).filter(tile =>
            tile.textContent.trim() !== '' &&
            tile.getAttribute('data-state') === 'tbd' // "to be determined"
        );

        return filledTiles.length === 5;
    }

    return false;
}

async function checkWordWithAPI(word) {
    if (isApiCallInProgress || word === lastCheckedWord) {
        return;
    }

    isApiCallInProgress = true;
    lastCheckedWord = word;

    try {
        console.log(`Checking word: ${word}`);

        // Replace with your actual API endpoint
        const response = await fetch(`https://your-api-endpoint.com/check-word`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add any authentication headers if needed
                // 'Authorization': 'Bearer YOUR_TOKEN'
            },
            body: JSON.stringify({
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
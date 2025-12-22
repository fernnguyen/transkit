# Developer Guide

This guide provides an overview of the technical architecture of BangBang Translate to help developers understand how the extension works.

## Architecture Overview

BangBang Translate is built using the **Chrome Extension Manifest V3** architecture. It consists of three main components:

1.  **Content Script** (`src/content-script.js`):
    - Runs in the context of web pages.
    - Listens for user input in editable fields.
    - Detects the translation command suffix (`!!<lang>`).
    - Implements instant translate mode for configured domains.
    - Injects the confirmation UI (Shadow DOM) into the page.
    - Shows inline translation suggestions with keyboard shortcuts.
    - Communicates with the Background Service Worker to request translations.

2.  **Background Service Worker** (`src/background.js`):
    - Acts as the central hub for messaging.
    - Manages the **Offscreen Document** lifecycle.
    - Handles storage operations (Settings).
    - Routes translation requests from the Content Script to the Offscreen Document.

3.  **Offscreen Document** (`src/offscreen.js` & `pages/offscreen.html`):
    - Hosts the AI processing logic.
    - **Why Offscreen?** Chrome's `window.ai` APIs (Translator and Language Detector) are often restricted or more stable in a DOM context, which Service Workers lack. The Offscreen API bridges this gap.
    - Performs language detection and translation using the built-in Gemini Nano models.

## AI Integration

The extension leverages Chrome's experimental built-in AI APIs:

-   **`window.ai.languageDetector`**: Used to detect the source language of the input text.
-   **`window.ai.translator`**: Used to perform the actual translation.

### Translation Flow

#### Manual Mode

1.  **User Input**: User types `Hello !!es` in an input field.
2.  **Detection**: `content-script.js` detects the pattern and sends a message to `background.js`.
3.  **Routing**: `background.js` ensures the Offscreen document is open and forwards the message.
4.  **Processing**: `offscreen.js`:
    - Creates a translation session.
    - Sends the text to Chrome's AI Translation API.
    - Returns the translated result.
5.  **Display**: `content-script.js` shows a confirmation dialog with the translation.
6.  **User Action**: User can confirm (replace text) or revert (undo).

#### Instant Translate Mode

1.  **Domain Check**: User visits enabled domain (e.g., telegram.org).
2.  **Input Detection**: User types normally in input field.
3.  **Timer Start**: After user stops typing, timer starts (default: 3 seconds).
4.  **Translation**: Timer expires → request translation via `background.js`.
5.  **Inline Suggestion**: Show translated text below/above input with keyboard hints.
6.  **User Action**:
    - **Tab**: Apply translation (replace input text)
    - **Esc**: Dismiss suggestion
    - **Delete/Backspace**: Dismiss and continue editing
    - **Continue typing**: Dismiss and restart timer

## File Structure

```
bangbang-translate/
├── manifest.json           # Extension configuration
├── package.json            # Dependencies and scripts
├── src/
│   ├── background.js       # Service worker (message routing, settings)
│   ├── content-script.js   # Main content script (detection, UI, instant mode)
│   ├── offscreen.js        # Offscreen document (AI translation)
│   ├── popup.js            # Popup UI logic
│   └── common/
│       └── language-map.js # Language code normalization
├── pages/
│   ├── popup.html          # Extension popup
│   └── offscreen.html      # Offscreen document
└── assets/
    ├── styles/
    │   ├── tokens.css      # Design tokens
    │   ├── common.css      # Shared styles
    │   ├── dialogs.css     # Dialog/toast styles
    │   ├── popup.css       # Popup styles
    │   └── inline-suggestion.css  # Instant translate suggestion styles
    └── icons/              # Extension icons
```

## Key APIs Used

-   `chrome.runtime`: Messaging and lifecycle management.
-   `chrome.storage`: Persisting user settings.
-   `chrome.offscreen`: Creating the hidden document for AI execution.
-   `window.ai`: Accessing on-device AI models.

## Setup for Development

Ensure you have the following flags enabled in Chrome (Canary/Dev recommended):
-   `chrome://flags/#prompt-api-for-gemini-nano`: Enabled
-   `chrome://flags/#writer-api-for-gemini-nano`: Enabled
-   `chrome://flags/#language-detection-api`: Enabled

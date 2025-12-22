# Developer Guide

This guide provides an overview of the technical architecture of BangBang Translate to help developers understand how the extension works.

## Architecture Overview

BangBang Translate is built using the **Chrome Extension Manifest V3** architecture. It consists of three main components:

1.  **Content Script** (`src/content-script.js`):
    - Runs in the context of web pages.
    - Monitors user input in `<input>` and `<textarea>` elements.
    - Detects the translation command suffix (`--t: <lang>`).
    - Injects the confirmation UI (Shadow DOM) into the page.
    - Communicates with the Background Service Worker to request translations.

2.  **Background Service Worker** (`src/background.js`):
    - Acts as the central hub for messaging.
    - Manages the **Offscreen Document** lifecycle.
    - Handles storage operations (Settings, History).
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

1.  **User Input**: User types `Hello --t: es` in an input field.
2.  **Detection**: `content-script.js` detects the pattern and sends a message to `background.js`.
3.  **Routing**: `background.js` ensures the Offscreen document is open and forwards the message.
4.  **Processing**: `offscreen.js`:
    - Normalizes the target language code (e.g., "spanish" -> "es").
    - Detects the source language (if not specified).
    - Checks availability of the language pair.
    - Creates a `Translator` instance and runs the translation.
5.  **Response**: The result is sent back through `background.js` to `content-script.js`.
6.  **UI Update**: `content-script.js` updates the confirmation dialog with the result.
7.  **Replacement**: On confirmation, the input field value is replaced.

## File Structure

```
bangbang-translate/
├── manifest.json           # Extension configuration
├── package.json            # Dependencies and scripts
├── src/
│   ├── background.js       # Service Worker
│   ├── content-script.js   # Page interaction logic
│   ├── offscreen.js        # AI processing logic
│   ├── popup.js            # Popup UI logic
│   └── common/
│       └── language-map.js # Language code utilities
├── pages/
│   ├── offscreen.html      # Host for offscreen.js
│   └── popup.html          # Popup UI HTML
└── assets/
    ├── icons/              # Extension icons
    └── styles/             # CSS files
```

## Key APIs Used

-   `chrome.runtime`: Messaging and lifecycle management.
-   `chrome.storage`: Persisting user settings and history.
-   `chrome.offscreen`: Creating the hidden document for AI execution.
-   `window.ai`: Accessing on-device AI models.

## Setup for Development

Ensure you have the following flags enabled in Chrome (Canary/Dev recommended):
-   `chrome://flags/#prompt-api-for-gemini-nano`: Enabled
-   `chrome://flags/#writer-api-for-gemini-nano`: Enabled
-   `chrome://flags/#language-detection-api`: Enabled

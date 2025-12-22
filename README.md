# BangBang Translate

**BangBang Translate** is a Chrome extension that brings instant, AI-powered translation directly to your input fields. No more switching tabs or copy-pasting—just type, command, and translate.

## Features

- **Instant Translation**: Translate text directly within any input field or textarea.
- **AI-Powered**: Uses Chrome's built-in AI (Gemini Nano) for fast, local, and private translations.
- **Privacy-First**: All translations happen locally on your device. No data is sent to the cloud.
- **Seamless Integration**: Works on any website with standard input fields.
- **Customizable**: Set your preferred native language and translation behavior.

## Installation

Currently, BangBang Translate is available for installation via "Load Unpacked" for developers and early adopters.

1.  **Clone the repository**:
    ```bash
    git clone http://github.com/fernnguyen/bangbang-translate.git
    ```
2.  **Open Chrome Extensions**:
    - Navigate to `chrome://extensions/` in your browser.
3.  **Enable Developer Mode**:
    - Toggle the "Developer mode" switch in the top right corner.
4.  **Load Unpacked**:
    - Click "Load unpacked" and select the directory where you cloned the repository.

> [!IMPORTANT]
> This extension relies on Chrome's built-in AI APIs (`window.ai`). Ensure you are using a compatible version of Chrome (Canary or Dev channel may be required) and have enabled the necessary flags for "Prompt API for Gemini Nano" and "Language Detection API".

## Usage

1.  **Type your text** in any input field or textarea.
2.  **Append the translation command**: `!!<code/alias>` or `!!t` (default target).
    - Example: `Hello world !!es` (translates to Spanish)
    - Example: `Bom dia !!en` (translates to English)
    - Example: `Hello !!t` (translates to your default target language)
    - Example: `Hello !!e` (uses your custom alias 'e')
3.  **Confirm or Revert**:
    - **Manual Mode**: A modal appears. Press **Enter** to replace.
    - **Auto Mode**: Text is replaced immediately. A dialog appears for 10s (configurable) allowing you to **Revert** if needed.

### Popup Settings

Click the extension icon in the toolbar to access settings:
- **Native Language**: Select your native language.
- **Default Target**: Select the language for `!!t`.
- **Revert Timeout**: Set how long the undo dialog stays visible.
- **Aliases**: Define custom shortcuts (e.g., `e` -> `en`).
- **History**: View your recent translations.

## License

This project is licensed under the MIT License.

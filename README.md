# TransKit

**TransKit** is a Chrome extension that brings instant, AI-powered translation directly to your input fields. No more switching tabs or copy-pasting—just type, command, and translate.

![TransKit Popup](landing/screenshot/popup.png)


## Features

- **Instant Translation**: Type `!!<lang>` or `!!t` after your text to translate instantly
- **Multiple AI Providers**: Choose from Chrome Built-in AI, Google Gemini, OpenAI, Groq, Ollama (local), or custom endpoints
- **Custom Prompts**: Tailor translation behavior for technical, casual, or medical terminology
- **Instant Domain Mode**: Auto-translate on specific domains (chat apps, AI assistants) with inline suggestions
- **Quick Toggle**: Press `Ctrl+Shift+I` to enable/disable instant mode (auto-adds domain if not in list)
- **Instant Label Indicator**: Visual badge above input fields when instant mode is active
- **Select-to-Translate**: Highlight text to translate with a draggable, feature-rich popup
- **Smart Language Detection**: Automatically detects source language
- **Customizable Aliases**: Create shortcuts for your most-used languages
- **Non-blocking UI**: Continue working while translations process
- **Privacy-First**: Default to Chrome's built-in AI for offline, private translation

## Installation

### Option 1: Chrome Web Store (Recommended)

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/transkit-power-inline-tra/alklecnckbdobhekgihddbpnggjkjnlj)**

One-click installation with automatic updates.

### Option 2: Manual Installation (Developers)

For developers and early adopters who want to run from source:

1.  **Clone the repository**:
    ```bash
    git clone http://github.com/fernnguyen/transkit.git
    ```
2.  **Open Chrome Extensions**:
    - Navigate to `chrome://extensions/` in your browser.
3.  **Enable Developer Mode**:
    - Toggle the "Developer mode" switch in the top right corner.
4.  **Load Unpacked**:
    - Click "Load unpacked" and select the `extension` directory from the cloned repository.

> [!IMPORTANT]
> This extension works best with Chrome's built-in AI APIs (`window.ai`). For the default provider, ensure you are using Chrome 131+ and have enabled the necessary flags for "Prompt API for Gemini Nano" and "Language Detection API". Alternatively, configure a different AI provider (Gemini, OpenAI, Groq, Ollama, etc.) in the extension settings.

## Usage

### Manual Translation Mode

Type your text in any input field, then add the translation command:

```
Hello, how are you? !!vi
→ Xin chào, bạn khỏe không?

Tôi đang học tiếng Anh !!en
→ I am learning English

Quick translate to default target: !!t
```

### Instant Domain Translation Mode

Enable in settings for automatic translation on specific domains (Telegram, Discord, ChatGPT, etc.):

![Instant Translation](landing/screenshot/instant.png)


1. Open extension popup
2. Enable "Instant Translate for specific domains"
3. Configure delay (default: 3 seconds)
4. Manage domains and their popup position (top/bottom)
5. Visit an enabled domain and start typing

**How it works:**
- Type your message normally
- Wait for configured delay (no need to add `!!`)
- Inline suggestion appears below/above input
- Press **Tab** to apply translation
- Press **Esc** to dismiss
- Press **Delete/Backspace** to dismiss and edit

### Keyboard Shortcuts

- **Tab**: Apply suggested translation (Manual & Instant mode)
- **Esc**: Dismiss suggestion or popup
- **Delete/Backspace**: Dismiss suggestion and continue editing
- **Ctrl+Shift+I** (or **Cmd+Shift+I** on Mac): Toggle Instant Translate for the current domain

## Configuration

Open the extension popup to customize:

<p align="center">
  <img src="landing/screenshot/setting_general.png" width="45%" />
  <img src="landing/screenshot/setting_provider.png" width="45%" />
</p>


- **Enable/Disable Extension**: Toggle the extension on/off
- **Native Language**: Your primary language
- **Default Target Language**: Language to translate to when using `!!t`
- **Revert Timeout**: How long to show the confirmation dialog
- **Prefer Native as Source**: Use native language as default source
- **Show Confirm Modal**: Display confirmation before applying translation
- **Custom Aliases**: Create shortcuts (e.g., `e` → `en`, `v` → `vi`)

### Instant Translate Settings

- **Enable Instant Translate**: Turn on auto-translation for specific domains
- **Delay**: Time to wait before translating (1-10 seconds)
- **Active Domains**: Manage domains with enable/disable toggles
- **Position**: Choose popup position (top/bottom) per domain
- **Add Custom Domain**: Add your own domains to the list

**Default Domains:**
- telegram.org (top)
- discord.com (top)
- zalo.me (top)
- openai.com (top)
- claude.ai (top)
- gemini.google.com (top)

## Changelog

### v1.2.0
- **New**: **Hover to Translate** - Simply hover over any text and press a modifier key (default: `Ctrl`) to see an instant translation.
  - **Smart Selection**: Intelligently detects paragraphs, sentences, or specific text blocks.
  - **Unique Mode**: Option to show only one translation at a time to keep your screen clean.
  - **Customizable**: Choose your preferred modifier key (Ctrl, Alt, Shift), text color, and font size.
  - **Inject or Replace**: Choose to display translation below the original text or replace it entirely.
- **Improved**: **Modernized UI** - Replaced checkboxes with sleek toggle switches for a cleaner look.
- **Improved**: **Settings Organization** - Better layout for settings with instant auto-save for all preferences.
- **Improved**: **Localization** - Added full Vietnamese language support for all new features.
- **Fix**: Resolved various minor UI bugs and improved performance.

### v1.1.2
- **New**: Custom AI Provider Support - Configure your own translation providers
  - **Ollama (Local)**: Run AI models locally on your machine for 100% privacy and offline capability
  - **Groq (Fast)**: Lightning-fast inference with generous free tier (llama-3.3-70b-versatile, mixtral-8x7b, etc.)
  - **Custom Endpoint**: Connect to any OpenAI-compatible API
- **New**: Custom Prompt Configuration - Tailor translation behavior to your specific needs
  - Add custom context for technical, casual, or medical terminology
  - Maximum 500 characters for optimal performance
- **New**: AI Provider Management UI - Easily switch between and configure multiple providers
  - Google Gemini, OpenAI, OpenRouter, DeepL, Ollama, and custom endpoints
- **Improvement**: Enhanced error handling and debugging for API connections
- **Fix**: Added localhost permissions for local AI provider support

#### Setting up Ollama (Recommended for Privacy)

1. **Install Ollama**: Download from [ollama.com](https://ollama.com)

2. **Pull a model** (we recommend `qwen2.5:1.5b` for fast responses):
   ```bash
   ollama pull qwen2.5:1.5b
   ```

3. **Enable CORS** (required for extension access):
   ```bash
   # macOS/Linux
   OLLAMA_ORIGINS="*" ollama serve
   
   # Windows PowerShell
   $env:OLLAMA_ORIGINS="*"
   ollama serve
   ```

4. **Configure in TransKit**:
   - Open extension popup → AI Provider tab
   - Click "+ Add Provider"
   - Select "Ollama (Local)"
   - Name: `Local Ollama`
   - Model: `qwen2.5:1.5b`
   - Click "Save" and "Use"

5. **Test it**: Type `Hello !!vi` in any input field!

**Why Ollama?**
- 100% Privacy - Everything runs locally
- Free - No API costs
- Offline - Works without internet
- Fast - Models like `qwen2.5:1.5b` respond in milliseconds

### v1.1.1
- **New**: Added `Ctrl+Shift+I` (Cmd on Mac) shortcut to quickly toggle Instant Translate for the current domain.
- **New**: Added "Instant" label indicator above input fields when instant mode is active.
- **Improvement**: Select-to-Translate popup is now draggable.
- **Improvement**: Added "Copy to Clipboard" button in Select-to-Translate popup.
- **Improvement**: Added Model selection and Source/Target language selectors directly in the Select-to-Translate popup.
- **Improvement**: Enhanced UI aesthetics with smooth transitions and better positioning.

## License

This project is licensed under the MIT License.

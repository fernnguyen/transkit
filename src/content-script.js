let normalizeLanguageToCode;

const TRANSLATION_COMMAND_PATTERN = /!!([a-zA-ZÀ-ÿ\-]+)$/i;

let isTranslating = false;
let debounceTimer = null;

// Instant translate state
let instantTimer = null;
let currentSuggestion = null;
let justAppliedTranslation = false;
let currentKeyHandler = null; // Track active keyboard handler

// Select-to-translate state
let selectionIcon = null;
let selectionPopup = null;
let selectedText = "";

const commonStyles = {
  fontFamily: "system-ui, sans-serif",
  background: "#FFFF",
  color: "#1C2024",
  borderRadius: "0.375rem",
  boxShadow: "0 .375rem 1.5rem #0000000f",
  zIndex: "9999999999"
};

(async function bootstrap() {
  const mod = await import(chrome.runtime.getURL("src/common/language-map.js"));
  normalizeLanguageToCode = mod.normalizeLanguageToCode;
  injectGlobalStylesheet();
  registerAutoDetection();
  registerInstantMode();
  registerSelectionMode();
})();

function injectGlobalStylesheet() {
  const href = chrome.runtime.getURL("assets/styles/dialogs.css");
  if (![...document.styleSheets].some((s) => s.href === href)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

function isEditableElement(element) {
  if (!element) return false;

  const tag = element.tagName?.toLowerCase();

  if (tag === "input") {
    const type = element.getAttribute("type") || "text";
    return (
      ["text", "search", "email", "url", "tel", "password"].includes(type) ||
      !type
    );
  }

  if (tag === "textarea") return true;
  if (element.isContentEditable) return true;

  return false;
}

function getDeepActiveElement(root = document) {
  let element = root.activeElement || null;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

function getActiveEditableElement() {
  const element = getDeepActiveElement();
  return isEditableElement(element) ? element : null;
}

function parseFieldTextAndCommand(element) {
  if (!element) return null;

  let value = "";
  const tag = element.tagName?.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    value = element.value;
  } else if (element.isContentEditable) {
    value = element.innerText;
  }

  const match = value.match(TRANSLATION_COMMAND_PATTERN);
  if (!match) return null;

  const languageRaw = match[1];
  const precedingText = value.slice(0, match.index).trimEnd();
  return { text: precedingText, languageRaw };
}

function setFieldText(element, newText) {
  const tag = element.tagName?.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    element.value = newText;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  if (element.isContentEditable) {
    element.textContent = newText;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
}

function createOverlayShadowHost() {
  const host = document.createElement("div");
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = commonStyles.zIndex;
  host.style.inset = "0";
  host.style.pointerEvents = "none"; // Ensure clicks pass through the host
  document.documentElement.appendChild(host);
  return host.attachShadow({ mode: "closed" });
}

function attachStylesheetToShadowRoot(shadowRoot) {
  const href = chrome.runtime.getURL("assets/styles/dialogs.css");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  shadowRoot.appendChild(link);
}

function buildDialog(mode = "confirm") {
  const shadowRoot = createOverlayShadowHost();
  attachStylesheetToShadowRoot(shadowRoot);

  const container = document.createElement("div");
  container.className = "bt-dialog-overlay";
  // Allow interaction with dialog even if overlay is transparent
  container.style.pointerEvents = "none"; // Ensure clicks pass through container

  const panel = document.createElement("div");
  panel.className = "bt-dialog";
  panel.style.pointerEvents = "auto"; // Re-enable clicks on the panel

  const titleBar = document.createElement("div");
  titleBar.className = "bt-title-bar";

  const title = document.createElement("div");
  title.className = "bt-title";
  title.textContent = mode === "revert" ? "Translation Applied" : "Confirm Translation";

  const closeButton = document.createElement("button");
  closeButton.className = "bt-close-button";
  closeButton.innerHTML = `<span class="bt-shortcut">ESC</span> ×`;
  closeButton.setAttribute("aria-label", "Close (ESC)");

  titleBar.appendChild(title);
  titleBar.appendChild(closeButton);

  const content = document.createElement("div");
  content.className = "bt-content";

  const sourceText = document.createElement("div");
  sourceText.className = "bt-source-text";

  const directionIndicator = document.createElement("div");
  directionIndicator.className = "bt-indicator";
  directionIndicator.textContent = "↓";

  const translatedText = document.createElement("div");
  translatedText.className = "bt-translated-text";

  const footer = document.createElement("div");
  footer.className = "bt-actions";

  const secondaryButton = document.createElement("button");
  secondaryButton.className = "bt-button bt-cancel";
  secondaryButton.textContent = mode === "revert" ? "Dismiss" : "Cancel";

  const primaryButton = document.createElement("button");
  primaryButton.className = "bt-button bt-confirm";
  primaryButton.textContent = mode === "revert" ? "Revert" : "Replace";

  const loading = document.createElement("div");
  loading.className = "bt-loading";

  const spinner = document.createElement("div");
  spinner.className = "bt-loading-spinner";

  loading.appendChild(spinner);
  loading.appendChild(document.createTextNode("Translating..."));

  content.appendChild(sourceText);
  content.appendChild(directionIndicator);
  content.appendChild(translatedText);
  footer.appendChild(secondaryButton);
  footer.appendChild(primaryButton);
  panel.appendChild(titleBar);
  panel.appendChild(loading);
  panel.appendChild(content);
  panel.appendChild(footer);
  container.appendChild(panel);
  shadowRoot.appendChild(container);

  function setLoadingVisible(visible) {
    loading.style.display = visible ? "flex" : "none";
    content.style.opacity = visible ? "0.6" : "1";
  }

  function destroy() {
    shadowRoot.host.remove();
  }

  return {
    sourceText,
    translatedText,
    primaryButton,
    secondaryButton,
    closeButton,
    setLoadingVisible,
    destroy,
    shadowRoot,
    panel
  };
}

async function getSettings() {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    showToast("Extension updated. Please refresh the page.");
    return {
      enabled: false,
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      preferNativeAsSource: true,
      showConfirmModal: true,
      dialogTimeout: 10,
      aliases: {}
    };
  }
  
  const res = await chrome.runtime.sendMessage({ type: "get-settings" });
  if (res?.ok) return res.settings;
  return {
    enabled: true,
    nativeLanguageCode: "vi",
    targetLanguageCode: "en",
    preferNativeAsSource: true,
    showConfirmModal: true,
    dialogTimeout: 10,
    aliases: {}
  };
}

async function requestTranslation(payload) {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    throw new Error("Extension updated. Please refresh the page.");
  }
  return chrome.runtime.sendMessage({ type: "translate", payload });
}

function removeTranslationCommandSuffix(element) {
  if (!element) return "";

  let value = "";
  const tag = element.tagName?.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    value = element.value;
    value = value.replace(TRANSLATION_COMMAND_PATTERN, "").trimEnd();
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return value;
  }

  if (element.isContentEditable) {
    value = element.innerText;
    value = value.replace(TRANSLATION_COMMAND_PATTERN, "").trimEnd();
    element.textContent = value;
    return value;
  }

  return "";
}

function showToast(message) {
  const host = document.createElement("div");
  host.className = "bt-toast";
  host.textContent = message;
  document.documentElement.appendChild(host);
  setTimeout(() => host.remove(), 2400);
}

function registerAutoDetection() {
  document.addEventListener("input", handleUserInputEvent, true);
  document.addEventListener("blur", handleUserInputEvent, true);
}

function handleUserInputEvent() {
  const element = getActiveEditableElement();
  if (!element) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => attemptTranslationTrigger(element), 600);
}

function attemptTranslationTrigger(element) {
  if (isTranslating) return;
  const parsed = parseFieldTextAndCommand(element);
  if (!parsed) return;
  handleAutoTranslation(element, parsed);
}

function resolveTargetLanguage(raw, settings) {
  if (raw === "t") return settings.targetLanguageCode || "en";
  
  // Check aliases
  if (settings.aliases && settings.aliases[raw]) {
    return settings.aliases[raw];
  }

  // Fallback to normalization (e.g. "english" -> "en")
  return normalizeLanguageToCode(raw);
}

async function handleAutoTranslation(element, parsed) {
  isTranslating = true;
  let dialog = null;

  try {
    const baseText = parsed.text;
    
    // Wrap getSettings to catch invalidation early
    let settings;
    try {
      settings = await getSettings();
    } catch (e) {
      if (e.message.includes("Extension context invalidated")) {
        showToast("Extension updated. Please refresh the page.");
        return;
      }
      throw e;
    }

    if (settings.enabled === false) return;

    const targetCode = resolveTargetLanguage(parsed.languageRaw, settings);

    if (!baseText || !baseText.trim()) return;
    if (!targetCode) {
      showToast("Invalid language or alias");
      return;
    }

    const cleanSourceValue = removeTranslationCommandSuffix(element);
    
    // Show loading toast immediately
    showToast("Translating...");

    // Determine mode: "confirm" (manual) or "revert" (auto)
    const mode = settings.showConfirmModal ? "confirm" : "revert";
    dialog = buildDialog(mode);
    
    dialog.sourceText.textContent = cleanSourceValue;
    dialog.translatedText.textContent = "";
    dialog.setLoadingVisible(true);
    
    // Don't refocus the input - it causes cursor to jump and ESC key issues

    let res;
    try {
      res = await requestTranslation({
        text: cleanSourceValue,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: targetCode,
        preferNativeAsSource: settings.preferNativeAsSource !== false
      });
    } catch (e) {
      if (e.message.includes("Extension context invalidated")) {
        throw new Error("Extension updated. Please refresh the page.");
      }
      throw e;
    }

    if (!res || !res.ok) {
      dialog.destroy();
      showToast(res?.error ? String(res.error) : "Translation failed");
      return;
    }

    const translation = res.result?.translation ? res.result.translation : "";
    dialog.translatedText.textContent = translation;
    dialog.setLoadingVisible(false);

    let revertTimer;

    function applyTranslation() {
      setFieldText(element, translation);
    }

    function revertTranslation() {
      setFieldText(element, cleanSourceValue);
      dialog.destroy();
    }

    function onPrimaryClick() {
      if (mode === "confirm") {
        applyTranslation();
        dialog.destroy();
      } else {
        // In revert mode, primary is "Revert"
        revertTranslation();
      }
    }

    function onSecondaryClick() {
      if (mode === "confirm") {
        dialog.destroy();
      } else {
        // In revert mode, secondary is "Dismiss"
        dialog.destroy();
      }
    }

    dialog.primaryButton.addEventListener("click", onPrimaryClick);
    dialog.secondaryButton.addEventListener("click", onSecondaryClick);
    dialog.closeButton.addEventListener("click", onSecondaryClick);
    
    // Shadow DOM event listener
    dialog.shadowRoot.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") onPrimaryClick();
      if (ev.key === "Escape") onSecondaryClick();
    });

    // Document-level ESC listener (works even when shadow DOM doesn't have focus)
    const handleEscKey = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        onSecondaryClick();
      }
    };
    document.addEventListener("keydown", handleEscKey, true); // Use capture phase

    // Cleanup function to remove document listener
    const originalDestroy = dialog.destroy;
    dialog.destroy = () => {
      document.removeEventListener("keydown", handleEscKey, true);
      originalDestroy();
    };

    if (mode === "revert") {
      // Auto-apply immediately
      applyTranslation();
      
      // Setup auto-dismiss
      const timeoutSec = settings.dialogTimeout || 10;
      
      // Update UI to show it's done but reversible
      // Primary button becomes Revert
      // Secondary becomes Dismiss
      
      revertTimer = setTimeout(() => {
        dialog.destroy();
      }, timeoutSec * 1000);

      // Pause timer on hover
      dialog.panel.addEventListener("mouseenter", () => clearTimeout(revertTimer));
      dialog.panel.addEventListener("mouseleave", () => {
        revertTimer = setTimeout(() => {
          dialog.destroy();
        }, timeoutSec * 1000);
      });
    }

  } catch (err) {
    if (dialog) dialog.destroy();
    showToast(err.message || "An error occurred");
    console.error(err);
  } finally {
    isTranslating = false;
  }
}

// ============================================
// INSTANT TRANSLATE MODE
// ============================================

function isInstantDomain(settings) {
  if (!settings.instantTranslateEnabled) return null;
  
  const hostname = window.location.hostname;
  return settings.instantDomains.find(
    d => d.enabled && hostname.includes(d.domain)
  ) || null;
}

function shouldTriggerInstant(text) {
  // Don't trigger if:
  if (!text || text.trim().length < 5) return false; // Too short
  if (/^https?:\/\//.test(text)) return false; // URL
  if (/^[!@#$%^&*()_+=\[\]{};':"\\|,.<>/?`~-]+$/.test(text)) return false; // Only special chars
  return true;
}

function setFieldText(element, text) {
  const tag = element.tagName?.toLowerCase();
  
  if (tag === "input" || tag === "textarea") {
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (element.isContentEditable) {
    element.textContent = text;
  }
}

function buildInlineSuggestion(element, translatedText, position = 'bottom') {
  const container = document.createElement('div');
  container.className = 'bt-inline-suggestion';
  
  // Position relative to input
  const rect = element.getBoundingClientRect();
  container.style.position = 'fixed';
  container.style.zIndex = '9999999999';
  
  // Set position based on preference
  if (position === 'top') {
    container.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  } else {
    container.style.top = `${rect.bottom + 4}px`;
  }
  
  container.style.left = `${rect.left}px`;
  container.style.width = `${rect.width - 80}px`;
  
  container.innerHTML = `
    <div class="bt-suggestion-content">
      <span class="bt-suggestion-icon">🌐</span>
      <span class="bt-suggestion-text">${translatedText}</span>
    </div>
    <span class="bt-suggestion-hint"><kbd>Tab</kbd> to apply • <kbd>Esc</kbd> to dismiss</span>
  `;
  
  document.body.appendChild(container);
  
  return {
    element: container,
    translatedText,
    destroy: () => {
      container.remove();
    }
  };
}

function setupSuggestionKeyHandlers(element, suggestion) {
  // CRITICAL: Remove any existing handler first
  if (currentKeyHandler) {
    document.removeEventListener("keydown", currentKeyHandler, true);
    currentKeyHandler = null;
  }
  
  const handleKey = (ev) => {
    // Only handle specific keys, let everything else pass through
    if (ev.key === "Tab") {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      
      // IMPORTANT: Cleanup FIRST before applying translation
      document.removeEventListener("keydown", handleKey, true);
      currentKeyHandler = null;
      
      // Set flag to prevent instant translate from re-triggering
      justAppliedTranslation = true;
      
      // Then apply translation
      setFieldText(element, suggestion.translatedText);
      suggestion.destroy();
      currentSuggestion = null;
      
      // Clear flag after a short delay
      setTimeout(() => {
        justAppliedTranslation = false;
      }, 500);
      
      return;
    }
    
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      
      // Cleanup
      document.removeEventListener("keydown", handleKey, true);
      currentKeyHandler = null;
      
      // Dismiss
      suggestion.destroy();
      currentSuggestion = null;
      
      return;
    }
    
    if (ev.key === "Backspace" || ev.key === "Delete") {
      // Cleanup FIRST
      document.removeEventListener("keydown", handleKey, true);
      currentKeyHandler = null;
      
      // Dismiss suggestion and allow delete to work
      suggestion.destroy();
      currentSuggestion = null;
      
      // Don't prevent default - let the delete happen
      return;
    }
    
    // All other keys: do nothing, let them pass through completely
  };
  
  // Store reference and add listener
  currentKeyHandler = handleKey;
  document.addEventListener("keydown", handleKey, true);
}

async function handleInstantTranslate(element) {
  // Skip if we just applied a translation
  if (justAppliedTranslation) return;
  
  const text = element.value?.trim() || element.innerText?.trim();
  if (!shouldTriggerInstant(text)) return;
  
  let settings;
  try {
    settings = await getSettings();
  } catch (e) {
    return; // Silently fail if settings unavailable
  }
  
  const domainConfig = isInstantDomain(settings);
  if (!domainConfig) return;
  
  // Clear existing timer
  if (instantTimer) {
    clearTimeout(instantTimer);
    instantTimer = null;
  }
  
  // Dismiss existing suggestion
  if (currentSuggestion) {
    currentSuggestion.destroy();
    currentSuggestion = null;
  }
  
  // Start new timer
  instantTimer = setTimeout(async () => {
    try {
      showToast("Translating...");
      
      const res = await requestTranslation({
        text: text,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: settings.targetLanguageCode || "es",
        preferNativeAsSource: settings.preferNativeAsSource !== false
      });
      
      if (res?.ok && res.result?.translation) {
        const position = domainConfig.position || 'bottom';
        currentSuggestion = buildInlineSuggestion(element, res.result.translation, position);
        setupSuggestionKeyHandlers(element, currentSuggestion);
      }
    } catch (err) {
      console.error("Instant translate error:", err);
    }
  }, settings.instantDelay || 3000);
}

function registerInstantMode() {
  // Listen for input changes
  document.addEventListener('input', async (e) => {
    const element = getActiveEditableElement();
    if (!element) return;
    
    // Don't interfere with manual mode
    if (isTranslating) return;
    
    // Check if manual command is being typed
    const text = element.value?.trim() || element.innerText?.trim();
    if (TRANSLATION_COMMAND_PATTERN.test(text)) return;
    
    handleInstantTranslate(element);
  }, true);
  
  // Listen for Enter key to cancel instant translate
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // User wants to send message immediately, cancel any pending translation
      if (instantTimer) {
        clearTimeout(instantTimer);
        instantTimer = null;
      }
      
      // Dismiss any visible suggestion
      if (currentSuggestion) {
        currentSuggestion.destroy();
        currentSuggestion = null;
      }
      
      // Remove keyboard handler if active
      if (currentKeyHandler) {
        document.removeEventListener("keydown", currentKeyHandler, true);
        currentKeyHandler = null;
      }
    }
  }, true);
}

// ============================================
// SELECT-TO-TRANSLATE MODE
// ============================================

function showTranslateIcon(x, y, selection) {
  hideTranslateIcon();
  
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  const icon = document.createElement('div');
  icon.className = 'bt-translate-icon';
  
  // Use extension icon instead of SVG
  const iconUrl = chrome.runtime.getURL('assets/icons/icon-19.png');
  icon.innerHTML = `<img src="${iconUrl}" width="19" height="19" alt="Translate" />`;
  
  icon.style.position = 'fixed';
  icon.style.zIndex = '9999999999';
  
  // Position near cursor - choose top or bottom based on viewport
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - y;
  const spaceAbove = y;
  
  // If more space below, show below cursor; otherwise show above
  if (spaceBelow > 200 || spaceBelow > spaceAbove) {
    icon.style.left = `${x - 20}px`;
    icon.style.top = `${y + 12}px`;
    icon.dataset.position = 'bottom';
  } else {
    icon.style.left = `${x - 20}px`;
    icon.style.top = `${y - 48}px`;
    icon.dataset.position = 'top';
  }
  
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    // Pass selection rect instead of icon rect for better positioning
    showTranslationPopup(rect, selectedText, icon.dataset.position);
  });
  
  document.body.appendChild(icon);
  selectionIcon = icon;
}

function hideTranslateIcon() {
  if (selectionIcon) {
    selectionIcon.remove();
    selectionIcon = null;
  }
}

function showTranslationPopup(selectionRect, text, iconPosition) {
  hideTranslationPopup();
  
  const popup = document.createElement('div');
  popup.className = 'bt-selection-popup';
  
  popup.innerHTML = `
    <div class="bt-selection-header">
      <span class="bt-selection-title">Translation</span>
      <button class="bt-selection-close">×</button>
    </div>
    <div class="bt-selection-content">
      <div class="bt-selection-original">
        <label>
          Original
          <select class="bt-selection-source-select"></select>
        </label>
        <div class="bt-selection-text">${text}</div>
      </div>
      <div class="bt-selection-translated">
        <label>Translated to <span class="bt-native-lang">Native</span></label>
        <div class="bt-selection-text bt-loading-text">Translating...</div>
      </div>
    </div>
    <div class="bt-selection-footer">
      <span class="bt-selection-version">BangBang Translation v1.0.0</span>
      <a href="#" class="bt-selection-settings">⚙️ Settings</a>
    </div>
  `;
  
  popup.style.position = 'fixed';
  popup.style.zIndex = '9999999999';
  
  // Center popup based on SELECTION rect
  const popupWidth = 350;
  const selectionCenter = selectionRect.left + (selectionRect.width / 2);
  const left = selectionCenter - (popupWidth / 2);
  
  // Ensure popup doesn't go off-screen
  const maxLeft = window.innerWidth - popupWidth - 10;
  const minLeft = 10;
  const finalLeft = Math.max(minLeft, Math.min(left, maxLeft));
  
  // Calculate arrow position relative to popup
  // Arrow should point to selection center
  const arrowLeft = selectionCenter - finalLeft;
  popup.style.setProperty('--bt-arrow-left', `${arrowLeft}px`);
  
  // Vertical positioning: close to selection
  // Use selectionRect.bottom/top directly
  if (iconPosition === 'bottom') {
    popup.style.left = `${finalLeft}px`;
    popup.style.top = `${selectionRect.bottom + 8}px`; // 8px gap from text
    popup.classList.add('bt-popup-bottom');
  } else {
    popup.style.left = `${finalLeft}px`;
    popup.style.bottom = `${window.innerHeight - selectionRect.top + 8}px`; // 8px gap from text
    popup.classList.add('bt-popup-top');
  }
  
  document.body.appendChild(popup);
  selectionPopup = popup;
  
  // Hide icon when popup opens
  hideTranslateIcon();
  
  // Update native language label and set default source
  getSettings().then(settings => {
    const nativeLang = settings.nativeLanguageCode || 'vi';
    const targetLang = settings.targetLanguageCode || 'en'; // Default source is target language
    
    const langName = getLanguageName(nativeLang);
    popup.querySelector('.bt-native-lang').textContent = langName;
    
    // Populate source selector with targetLang as default
    populateSourceLanguageSelector(popup, targetLang);
    
    // Initial translation
    translateSelectionWithSource(text, targetLang, popup);
  });
  
  popup.querySelector('.bt-selection-close').addEventListener('click', () => {
    hideTranslationPopup();
    hideTranslateIcon();
  });
  
  popup.querySelector('.bt-selection-source-select').addEventListener('change', (e) => {
    translateSelectionWithSource(text, e.target.value, popup);
  });
  
  // Settings link
  popup.querySelector('.bt-selection-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'open-options' });
  });
}

function hideTranslationPopup() {
  if (selectionPopup) {
    selectionPopup.remove();
    selectionPopup = null;
  }
}

async function translateSelectionWithSource(text, sourceLang, popup) {
  const settings = await getSettings();
  const nativeLang = settings.nativeLanguageCode || 'vi';
  
  const translatedDiv = popup.querySelector('.bt-selection-text.bt-loading-text');
  translatedDiv.textContent = 'Translating...';
  translatedDiv.classList.add('bt-loading-text');
  
  try {
    const res = await requestTranslation({
      text: text,
      nativeLanguageCode: nativeLang,
      targetLanguage: nativeLang,
      sourceLanguage: sourceLang, // Pass explicit source language
      preferNativeAsSource: sourceLang === 'auto'
    });
    
    if (res?.ok && res.result?.translation) {
      translatedDiv.textContent = res.result.translation;
      translatedDiv.classList.remove('bt-loading-text');
    } else {
      translatedDiv.textContent = 'Translation failed';
    }
  } catch (err) {
    translatedDiv.textContent = 'Error: ' + err.message;
  }
}

function populateLanguageSelector(popup) {
  const select = popup.querySelector('.bt-selection-lang-select');
  const languages = [
    { code: 'vi', name: 'Vietnamese' },
    { code: 'en', name: 'English' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' }
  ];
  
  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    select.appendChild(option);
  });
  
  getSettings().then(settings => {
    select.value = settings.nativeLanguageCode || 'vi';
  });
}

let lastPopupCloseTime = 0;

function registerSelectionMode() {
  document.addEventListener('mouseup', (e) => {
    // Ignore if clicking on icon or popup
    if (e.target.closest('.bt-translate-icon') || e.target.closest('.bt-selection-popup')) {
      return;
    }

    // Ignore if we just closed the popup (within 200ms)
    if (Date.now() - lastPopupCloseTime < 200) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text && text.length > 0) {
        // If popup is already open for this text, don't show icon
        if (selectionPopup && selectedText === text) {
          return;
        }
        
        selectedText = text;
        showTranslateIcon(e.clientX, e.clientY, selection);
      } else {
        hideTranslateIcon();
        // Don't hide popup here, let mousedown handle it (so we can copy text from popup)
      }
    }, 10);
  });
  
  document.addEventListener('mousedown', (e) => {
    // 1. Handle Popup Open State
    if (selectionPopup) {
      if (!selectionPopup.contains(e.target)) {
        // Clicked outside popup
        // Prevent default to PRESERVE selection
        e.preventDefault();
        e.stopPropagation();
        hideTranslationPopup();
        lastPopupCloseTime = Date.now();
      }
      return;
    }

    // 2. Handle Icon Open State (Popup is closed)
    if (selectionIcon) {
      if (!selectionIcon.contains(e.target)) {
        // Clicked outside icon
        // Let default behavior happen (selection clears)
        hideTranslateIcon();
      }
    }
  });
}

function populateSourceLanguageSelector(popup, defaultValue = 'auto') {
  const select = popup.querySelector('.bt-selection-source-select');
  const languages = [
    { code: 'auto', name: 'Auto-detect' },
    { code: 'en', name: 'English' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' }
  ];
  
  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    select.appendChild(option);
  });
  
  select.value = defaultValue;
}

function getLanguageName(code) {
  const names = {
    'en': 'English',
    'vi': 'Vietnamese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German'
  };
  return names[code] || code.toUpperCase();
}

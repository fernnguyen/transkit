let normalizeLanguageToCode;
let i18n;

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
  
  const i18nMod = await import(chrome.runtime.getURL("src/common/i18n.js"));
  i18n = i18nMod.i18n;
  
  // Initialize i18n with current settings
  getSettings().then(settings => {
    if (settings.interfaceLanguage) {
      i18n.setLanguage(settings.interfaceLanguage);
    }
  });

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.translatorSettings) {
      const newSettings = changes.translatorSettings.newValue;
      if (newSettings && newSettings.interfaceLanguage) {
        i18n.setLanguage(newSettings.interfaceLanguage);
      }
    }
  });
  
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



async function getSettings() {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    showToast(i18n.t("toast.extensionUpdated"));
    return {
      enabled: false,
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      preferNativeAsSource: true,
      showConfirmModal: true,
      dialogTimeout: 10,
      aliases: {},
      interfaceLanguage: "en"
    };
  }
  
  const res = await chrome.runtime.sendMessage({ type: "get-settings" });
  if (res?.ok) {
    // Initialize i18n with the fetched language setting
    if (i18n) {
      i18n.setLanguage(res.settings.interfaceLanguage || "en");
    }
    return res.settings;
  }
  return {
    enabled: true,
    nativeLanguageCode: "vi",
    targetLanguageCode: "en",
    preferNativeAsSource: true,
    showConfirmModal: true,
    dialogTimeout: 10,
    aliases: {},
    interfaceLanguage: "en"
  };
}

async function requestTranslation(payload) {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    throw new Error(i18n.t("toast.extensionUpdated"));
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
  host.className = "bt-toast bt-vars-container";
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
  let suggestion = null;

  try {
    const baseText = parsed.text;
    
    // Wrap getSettings to catch invalidation early
    let settings;
    try {
      settings = await getSettings();
    } catch (e) {
      if (e.message.includes("Extension context invalidated")) {
        showToast(i18n.t("toast.extensionUpdated"));
        return;
      }
      throw e;
    }

    if (settings.enabled === false) return;

    // Skip if this domain is already handled by instant translation
    if (isInstantDomain(settings)) return;

    const targetCode = resolveTargetLanguage(parsed.languageRaw, settings);

    if (!baseText || !baseText.trim()) return;
    if (!targetCode) {
      showToast(i18n.t("toast.invalidLanguage"));
      return;
    }

    const cleanSourceValue = removeTranslationCommandSuffix(element);
    
    // If confirm is OFF, just translate and replace immediately
    if (!settings.showConfirmModal) {
      showToast(i18n.t("toast.translating"));
      let res;
      try {
        res = await requestTranslation({
          text: cleanSourceValue,
          nativeLanguageCode: settings.nativeLanguageCode || "en",
          targetLanguage: targetCode,
          preferNativeAsSource: settings.preferNativeAsSource !== false
        });
      } catch (e) {
        showToast(e.message || i18n.t("toast.translationFailed"));
        return;
      }

      if (res?.ok && res.result?.translation) {
        setFieldText(element, res.result.translation);
      } else {
        showToast(res?.error ? String(res.error) : i18n.t("toast.translationFailed"));
      }
      return;
    }

    // If confirm is ON, show inline suggestion
    showToast(i18n.t("toast.translating"));

    let res;
    try {
      res = await requestTranslation({
        text: cleanSourceValue,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: targetCode,
        preferNativeAsSource: settings.preferNativeAsSource !== false
      });
    } catch (e) {
      showToast(e.message || i18n.t("toast.translationFailed"));
      return;
    }

    if (!res || !res.ok || !res.result?.translation) {
      showToast(res?.error ? String(res.error) : i18n.t("toast.translationFailed"));
      return;
    }

    const translation = res.result.translation;
    const providerInfo = `${res.result.providerName || 'AI'} (${res.result.providerType || 'Bot'})`;
    
    // Use buildInlineSuggestion instead of buildDialog
    suggestion = buildInlineSuggestion(element, translation, providerInfo, 'bottom');
    
    // Setup Tab/Esc handlers
    const handleKeydown = (ev) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        setFieldText(element, translation);
        suggestion.destroy();
        document.removeEventListener("keydown", handleKeydown, true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        suggestion.destroy();
        document.removeEventListener("keydown", handleKeydown, true);
      }
    };

    document.addEventListener("keydown", handleKeydown, true);

    // Cleanup if element loses focus or is removed
    const onBlur = () => {
      suggestion.destroy();
      document.removeEventListener("keydown", handleKeydown, true);
      element.removeEventListener("blur", onBlur);
    };
    element.addEventListener("blur", onBlur);

  } catch (err) {
    if (suggestion) suggestion.destroy();
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

function buildInlineSuggestion(element, translatedText, providerInfo, position = 'bottom') {
  const container = document.createElement('div');
  container.className = 'bt-inline-suggestion bt-vars-container';
  
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
  
  // Extract just the name for the tag if possible, or use the whole string
  // providerInfo is like "Name (Type)"
  const modelName = providerInfo ? providerInfo.split('(')[0].trim() : "AI";
  const iconUrl = chrome.runtime.getURL('assets/icons/icon-19.png');
  
  container.innerHTML = `
    <div class="bt-suggestion-content">
      <img src="${iconUrl}" class="bt-suggestion-icon" alt="TransKit" />
      <span class="bt-suggestion-text">${translatedText}</span>
    </div>
    <div class="bt-suggestion-footer">
      <span class="bt-model-tag">${modelName}</span>
      <span class="bt-suggestion-hint">${i18n.t("suggestion.hint")}</span>
    </div>
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
      showToast(i18n.t("toast.translating"));
      
      const res = await requestTranslation({
        text: text,
        nativeLanguageCode: settings.nativeLanguageCode || "en",
        targetLanguage: settings.targetLanguageCode || "es",
        preferNativeAsSource: settings.preferNativeAsSource !== false
      });
      
      if (res?.ok && res.result?.translation) {
        const position = domainConfig.position || 'bottom';
        const providerInfo = `${res.result.providerName || 'AI'} (${res.result.providerType || 'Bot'})`;
        currentSuggestion = buildInlineSuggestion(element, res.result.translation, providerInfo, position);
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
  icon.className = 'bt-translate-icon bt-vars-container';
  
  // Use extension icon instead of SVG
  const iconUrl = chrome.runtime.getURL('assets/icons/icon-32.png');
  icon.innerHTML = `<img src="${iconUrl}" width="24" height="24" alt="Translate" />`;
  
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

async function showTranslationPopup(selectionRect, text, iconPosition) {
  hideTranslationPopup();

  // Fetch settings first to ensure i18n is updated
  const settings = await getSettings();
  
  const popup = document.createElement('div');
  const iconUrl = chrome.runtime.getURL('assets/icons/icon-19.png');
  popup.className = 'bt-selection-popup bt-vars-container';
  popup.innerHTML = `
    <div class="bt-selection-bg-pattern"></div>
    <div class="bt-selection-header">
      <span class="bt-selection-title">
        <img src="${iconUrl}" width="19" height="19" alt="Translate"  style="float:left;margin-right:4px" /> 
        <span>${i18n.t("selection.title")}</span>
      </span>
      <button class="bt-selection-close">×</button>
    </div>
    <div class="bt-selection-content">
      <div class="bt-selection-original">
        <label>
          ${i18n.t("selection.original")}
          <select class="bt-selection-source-select"></select>
        </label>
        <div class="bt-selection-text bt-selection-content-style">${text}</div>
      </div>
      <div class="bt-selection-translated">
        <label>
          ${i18n.t("selection.translate")}
          <select class="bt-selection-target-select"></select>
        </label>
        <div class="bt-selection-result-container">
          <div class="bt-selection-text bt-loading-text bt-selection-content-style">${i18n.t("dialog.translating")}</div>
          <button class="bt-selection-copy-btn" title="${i18n.t("selection.copy")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span class="bt-copy-feedback">${i18n.t("selection.copied")}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="bt-selection-footer">
      <div class="bt-selection-provider-container">
        <!-- Provider selector or label will be injected here -->
      </div>
      <a href="#" class="bt-selection-settings">${i18n.t("selection.settings")}</a>
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
  
  // Populate selectors (Mirror Logic)
  const nativeLang = settings.nativeLanguageCode || 'vi';
  const targetLang = settings.targetLanguageCode || 'en';
  
  let defaultSource, defaultTarget;
  
  if (settings.preferNativeAsSource !== false) {
    defaultSource = targetLang;
    defaultTarget = nativeLang;
  } else {
    defaultSource = 'auto';
    defaultTarget = targetLang;
  }
  
  // Populate selectors
  populateLanguageSelector(popup.querySelector('.bt-selection-source-select'), defaultSource, true);
  populateLanguageSelector(popup.querySelector('.bt-selection-target-select'), defaultTarget, false);
  
  // Initial translation
  translateSelectionWithSource(text, defaultSource, popup, null, defaultTarget);
  
  popup.querySelector('.bt-selection-close').addEventListener('click', () => {
    hideTranslationPopup();
    hideTranslateIcon();
  });
  
  popup.querySelector('.bt-selection-source-select').addEventListener('change', (e) => {
    const providerSelect = popup.querySelector('.bt-selection-provider-select');
    const providerId = providerSelect ? providerSelect.value : null;
    const targetLang = popup.querySelector('.bt-selection-target-select').value;
    translateSelectionWithSource(text, e.target.value, popup, providerId, targetLang);
  });

  popup.querySelector('.bt-selection-target-select').addEventListener('change', (e) => {
    const providerSelect = popup.querySelector('.bt-selection-provider-select');
    const providerId = providerSelect ? providerSelect.value : null;
    const sourceLang = popup.querySelector('.bt-selection-source-select').value;
    translateSelectionWithSource(text, sourceLang, popup, providerId, e.target.value);
  });

  // Populate provider selector
  const providerSelect = populateProviderSelector(popup, settings);
  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      const sourceLang = popup.querySelector('.bt-selection-source-select').value;
      const targetLang = popup.querySelector('.bt-selection-target-select').value;
      translateSelectionWithSource(text, sourceLang, popup, e.target.value, targetLang);
    });
  }
  
  // Settings link
  popup.querySelector('.bt-selection-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'open-options' });
  });

  // Copy button
  const copyBtn = popup.querySelector('.bt-selection-copy-btn');
  copyBtn.addEventListener('click', async () => {
    const textToCopy = popup.querySelector('.bt-selection-translated .bt-selection-text').textContent;
    if (!textToCopy || textToCopy === i18n.t("dialog.translating")) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      copyBtn.classList.add('bt-copied');
      setTimeout(() => copyBtn.classList.remove('bt-copied'), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  });
}

function hideTranslationPopup() {
  if (selectionPopup) {
    selectionPopup.remove();
    selectionPopup = null;
  }
}

async function translateSelectionWithSource(text, sourceLang, popup, providerId = null, targetLangOverride = null) {
  const settings = await getSettings();
  const nativeLang = settings.nativeLanguageCode || 'vi';
  const targetLang = targetLangOverride || nativeLang;
  
  const translatedDiv = popup.querySelector('.bt-selection-translated .bt-selection-text');
  
  translatedDiv.textContent = i18n.t("dialog.translating");
  translatedDiv.classList.add('bt-loading-text');
  
  try {
    const res = await requestTranslation({
      text: text,
      nativeLanguageCode: nativeLang,
      targetLanguage: targetLang,
      sourceLanguage: sourceLang, // Pass explicit source language
      preferNativeAsSource: sourceLang === 'auto' ? false : settings.preferNativeAsSource,
      providerId: providerId // Pass provider override
    });
    
    if (res?.ok && res.result?.translation) {
      translatedDiv.textContent = res.result.translation;
      translatedDiv.classList.remove('bt-loading-text');
    } else {
      translatedDiv.textContent = i18n.t("toast.translationFailed");
    }
  } catch (err) {
    translatedDiv.textContent = 'Error: ' + err.message;
  }
}

function populateLanguageSelector(popup) {
  const select = popup.querySelector('.bt-selection-lang-select');
  const languages = [
    'vi', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'
  ];
  
  languages.forEach(code => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = i18n.t("lang." + code);
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

function populateLanguageSelector(select, defaultValue = 'auto', includeAuto = true) {
  if (!select) return;
  
  const languages = includeAuto 
    ? ['auto', 'en', 'vi', 'zh', 'ja', 'ko', 'es', 'fr', 'de']
    : ['en', 'vi', 'zh', 'ja', 'ko', 'es', 'fr', 'de'];
  
  languages.forEach(code => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = i18n.t("lang." + code);
    select.appendChild(option);
  });
  
  select.value = defaultValue;
}

function populateProviderSelector(popup, settings) {
  const container = popup.querySelector('.bt-selection-provider-container');
  const providers = settings.providers || [];
  const activeId = settings.activeProviderId || 'builtin';

  if (providers.length <= 1) {
    // Show as a label tag
    const provider = providers[0] || { name: 'Chrome Built-in AI' };
    const tag = document.createElement('span');
    tag.className = 'bt-selection-provider-tag';
    tag.textContent = `Model: ${provider.name}`;
    container.appendChild(tag);
  } else {
    // Show as a select dropdown
    const label = document.createElement('span');
    label.className = 'bt-selection-provider-label';
    label.textContent = 'Model: ';
    
    const select = document.createElement('select');
    select.className = 'bt-selection-provider-select';
    
    providers.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      if (p.id === activeId) option.selected = true;
      select.appendChild(option);
    });
    
    container.appendChild(label);
    container.appendChild(select);
    
    return select;
  }
  return null;
}

function getLanguageName(code) {
  return i18n.t("lang." + code) || code.toUpperCase();
}

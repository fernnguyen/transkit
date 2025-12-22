let normalizeLanguageToCode;

const TRANSLATION_COMMAND_PATTERN = /!!([a-zA-ZÀ-ÿ\-]+)$/i;

let isTranslating = false;
let debounceTimer = null;

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
      nativeLanguageCode: "en",
      targetLanguageCode: "es",
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
    nativeLanguageCode: "en",
    targetLanguageCode: "es",
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
  if (raw === "t") return settings.targetLanguageCode || "es";
  
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

//This file contains the complete hover to translate implementation for content-script.js
// Add these lines at the very end of content-script.js

// ============================================
// HOVER TO TRANSLATE
// ============================================

// Hover translate state
let hoverModifierPressed = false;
let hoverTranslateCache = new Map();
let currentHoveredElement = null;
let hoverTimeout = null;

function registerHoverTranslate() {
  // Track modifier key state
  document.addEventListener('keydown', async (e) => {
    const settings = await getSettings();
    if (!settings.hoverTranslateEnabled) return;
    if (!isHoverTranslateDomain(settings)) return;
    
    const key = settings.hoverModifierKey || 'ctrl';
    if (
      (key === 'ctrl' && (e.ctrlKey || e.metaKey)) ||
      (key === 'shift' && e.shiftKey) ||
      (key === 'alt' && e.altKey)
    ) {
      hoverModifierPressed = true;
      document.body.classList.add('bt-hover-translate-active');
      
      // Apply custom styles
      applyHoverCustomStyles(settings.hoverInjectStyle);
    }
  }, true);

  document.addEventListener('keyup', async (e) => {
    const settings = await getSettings();
    const key = settings.hoverModifierKey || 'ctrl';
    
    if (
      (key === 'ctrl' && !e.ctrlKey && !e.metaKey) ||
      (key === 'shift' && !e.shiftKey) ||
      (key === 'alt' && !e.altKey)
    ) {
      hoverModifierPressed = false;
      document.body.classList.remove('bt-hover-translate-active');
      clearAllHoverTranslations();
    }
  }, true);

  // Hover detection with debouncing
  document.addEventListener('mouseover', async (e) => {
    if (!hoverModifierPressed) return;
    
    const settings = await getSettings();
    if (!isHoverTranslateDomain(settings)) return;
    
    clearTimeout(hoverTimeout);
    const element = findTranslatableElement(e.target);
    
    if (!element || element === currentHoveredElement) return;
    
    currentHoveredElement = element;
    hoverTimeout = setTimeout(() => {
      handleHoverTranslate(element, settings);
    }, 200);
  }, true);

  document.addEventListener('mouseout', () => {
    clearTimeout(hoverTimeout);
  }, true);
}

function findTranslatableElement(target) {
  let element = target;
  let depth = 0;
  const maxDepth = 5;
  
  while (element && depth < maxDepth) {
    // Skip translation elements themselves
    if (element.classList?.contains('bt-hover-translation') || 
        element.classList?.contains('bt-hover-original') ||
        element.dataset?.btTranslated ||
        element.dataset?.btInjected) {
      element = element.parentElement;
      depth++;
      continue;
    }
    
    const text = element.textContent?.trim();
    
    if (text && text.length > 10 && text.length < 1000) {
      const tagName = element.tagName?.toLowerCase();
      if (['div', 'p', 'span', 'article', 'section', 'li', 'td', 'th'].includes(tagName)) {
        const textNodes = Array.from(element.childNodes).filter(
          n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
        );
        
        if (textNodes.length > 0 || element.children.length <= 2) {
          return element;
        }
      }
    }
    
    element = element.parentElement;
    depth++;
  }
  
  return null;
}

async function handleHoverTranslate(element, settings) {
  const text = element.textContent?.trim();
  if (!text) return;
  
  const cacheKey = `${text}-${settings.nativeLanguageCode}`; // Cache by native lang (target of hover translate)
  if (hoverTranslateCache.has(cacheKey)) {
    applyHoverTranslation(element, hoverTranslateCache.get(cacheKey), settings);
    return;
  }
  
  try {
    const res = await requestTranslation({
      text: text,
      nativeLanguageCode: settings.nativeLanguageCode || "en",
      targetLanguage: settings.nativeLanguageCode || "vi", // Translate TO native language
      sourceLanguage: settings.targetLanguageCode || "en", // FROM target language (e.g., English web content)
      useAutoDetect: false // Fixed Target→Native for hover
    });
    
    if (res?.ok && res.result?.translation) {
      const translation = res.result.translation;
      hoverTranslateCache.set(cacheKey, translation);
      applyHoverTranslation(element, translation, settings);
    } else {
      // Show error as translation
      applyHoverTranslation(element, `❌ ${res?.error || 'Translation failed'}`, settings, true);
    }
  } catch (err) {
    console.error('[HoverTranslate] Error:', err);
    applyHoverTranslation(element, `❌ ${err.message || 'Error'}`, settings, true);
  }
}

function applyHoverTranslation(element, translation, settings, isError = false) {
  if (element.dataset.btTranslated) return;
  element.dataset.btTranslated = 'true';
  
  const mode = settings.hoverTranslateMode || 'inject';
  
  if (mode === 'replace') {
    applyReplaceMode(element, translation, isError);
  } else {
    applyInjectMode(element, translation, settings, isError);
  }
}

function applyReplaceMode(element, translation, isError = false) {
  if (!element.dataset.btOriginal) {
    element.dataset.btOriginal = element.textContent;
  }
  
  replaceTextContent(element, translation);
  element.classList.add('bt-hover-translated');
  
  if (isError) {
    element.style.color = '#dc3545'; // text-danger red
    element.style.fontWeight = 'bold';
  }
}

function applyInjectMode(element, translation, settings, isError = false) {
  const translationEl = document.createElement('div');
  translationEl.className = 'bt-hover-translation';
  const style = settings.hoverInjectStyle || {};
  
  if (!style.showIcon) {
    translationEl.classList.add('bt-hover-no-icon');
  }
  if (style.underline) {
    translationEl.classList.add('bt-hover-underline');
  }
  
  translationEl.textContent = translation;
  translationEl.dataset.btInjected = 'true';
  
  // Apply error styling if needed
  if (isError) {
    translationEl.style.color = '#dc3545'; // text-danger red
    translationEl.style.fontWeight = 'bold';
  }
  
  element.style.position = 'relative';
  element.insertAdjacentElement('afterend', translationEl);
  element.classList.add('bt-hover-original');
}

function replaceTextContent(element, newText) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  
  if (textNodes.length > 0) {
    textNodes[0].textContent = newText;
    textNodes.slice(1).forEach(node => node.remove());
  }
}

function clearAllHoverTranslations() {
  document.querySelectorAll('.bt-hover-translation').forEach(el => el.remove());
  
  document.querySelectorAll('[data-bt-original]').forEach(el => {
    replaceTextContent(el, el.dataset.btOriginal);
    delete el.dataset.btOriginal;
    delete el.dataset.btTranslated;
    el.classList.remove('bt-hover-translated');
  });
  
  document.querySelectorAll('[data-bt-translated]').forEach(el => {
    delete el.dataset.btTranslated;
    el.classList.remove('bt-hover-original');
  });
  
  currentHoveredElement = null;
}

function isHoverTranslateDomain(settings) {
  if (!settings.hoverTranslateEnabled) return false;
  
  const currentUrl = window.location.href;
  return settings.hoverTranslateDomains.some(
    d => d.enabled && currentUrl.includes(d.domain)
  );
}

function applyHoverCustomStyles(style) {
  const root = document.documentElement;
  root.style.setProperty('--bt-hover-bg-color', style.backgroundColor || '#667eea');
  root.style.setProperty('--bt-hover-text-color', style.textColor || '#0c69e4');
  root.style.setProperty('--bt-hover-font-size', style.fontSize || '0.95em');
  root.style.setProperty('--bt-hover-show-icon', style.showIcon !== false ? 'inline' : 'none');
}

function registerHoverToggleShortcut() {
  document.addEventListener('keydown', async (e) => {
    const settings = await getSettings();
    const shortcut = settings.hoverToggleShortcut || {
      key: "H",
      ctrl: true,
      shift: true,
      alt: false
    };

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    const matches =
      e.key.toUpperCase() === shortcut.key.toUpperCase() &&
      modifierKey === shortcut.ctrl &&
      e.shiftKey === shortcut.shift &&
      e.altKey === shortcut.alt;

    if (matches) {
      e.preventDefault();
      e.stopPropagation();
      await toggleHoverDomainForCurrentUrl();
    }
  }, true);
}

async function toggleHoverDomainForCurrentUrl() {
  try {
    const settings = await getSettings();
    const currentUrl = window.location.href;

    const matchingDomainIndex = settings.hoverTranslateDomains.findIndex(
      d => currentUrl.includes(d.domain)
    );

    if (matchingDomainIndex === -1) {
      // Auto-add domain
      const domain = extractDomainFromUrl(currentUrl);
      
      settings.hoverTranslateDomains.push({
        domain: domain,
        enabled: true
      });
      
      await chrome.runtime.sendMessage({
        type: "set-settings",
        settings: settings
      });
      
      showToastBottomRight(`✨ Hover translate enabled for ${domain}`);
      return;
    }

    // Toggle enabled state
    const domain = settings.hoverTranslateDomains[matchingDomainIndex];
    domain.enabled = !domain.enabled;

    await chrome.runtime.sendMessage({
      type: "set-settings",
      settings: settings
    });

    const status = domain.enabled
      ? "✨ Hover translate enabled"
      : "Hover translate disabled";

    showToastBottomRight(`${status} for ${domain.domain}`);

    if (!domain.enabled) {
      clearAllHoverTranslations();
    }
  } catch (err) {
    console.error("Toggle hover domain error:", err);
    showToast("Error toggling hover domain");
  }
}

// Note: extractDomainFromUrl is already defined in content-script.js for instant translate
// If not, add it here:
// function extractDomainFromUrl(url) {
//   try {
//     const urlObj = new URL(url);
//     return urlObj.hostname;
//   } catch {
//     return window.location.hostname;
//   }
// }

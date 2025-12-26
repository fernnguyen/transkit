import { AIProviderService } from "./services/ai-providers.js";

const OFFSCREEN_URL = chrome.runtime.getURL("../pages/offscreen.html");
const SETTINGS_KEY = "translatorSettings";

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({});
  const hasOffscreen = contexts.some(
    (c) =>
      c.contextType === "OFFSCREEN_DOCUMENT" && c.documentUrl === OFFSCREEN_URL
  );

  if (!hasOffscreen) {
    await chrome.offscreen.createDocument({
      url: "../pages/offscreen.html",
      reasons: ["IFRAME_SCRIPTING"],
      justification:
        "Use built-in Translator and LanguageDetector APIs in a windowed context."
    });
  }
}

async function readSettings() {
  const { translatorSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  return (
    translatorSettings || {
      enabled: true,
      nativeLanguageCode: "vi",
      targetLanguageCode: "en",
      preferNativeAsSource: true,
      showConfirmModal: true,
      dialogTimeout: 10,
      aliases: {
        e: "en",
        v: "vi",
        ch: "zh",
        j: "ja"
      },
      interfaceLanguage: "en",
      // Instant translate settings
      instantTranslateEnabled: false,
      instantDelay: 3000,
      instantDomains: [
        { domain: "telegram.org", enabled: true, position: "top" },
        { domain: "discord.com", enabled: true, position: "top" },
        { domain: "zalo.me", enabled: true, position: "top" },
        { domain: "openai.com", enabled: true, position: "top" },
        { domain: "claude.ai", enabled: true, position: "top" },
        { domain: "gemini.google.com", enabled: true, position: "top" }
      ],
      // AI Provider settings
      activeProviderId: "builtin",
      providers: [
        {
          id: "builtin",
          type: "gemini-nano",
          name: "Chrome Built-in AI",
          config: {}
        }
      ],
      // Keyboard shortcut for toggle instant domain
      instantToggleShortcut: {
        key: "I",
        ctrl: true,
        shift: true,
        alt: false
      }
    }
  );
}

async function writeSettings(next) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ping") {
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "get-settings") {
    readSettings().then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  if (message?.type === "set-settings") {
    writeSettings(message.settings).then((s) =>
      sendResponse({ ok: true, settings: s })
    );
    return true;
  }

  if (message?.type === "translate") {
    readSettings().then(async (settings) => {
      // Extract payload using keys sent by content-script.js
      const { text, nativeLanguageCode, targetLanguage, sourceLanguage, providerId } = message.payload;
      
      // Map to standardized keys for AIProviderService
      // Use 'auto' if sourceLanguage is not explicitly provided
      const sourceLang = sourceLanguage || "auto"; 
      const targetLang = targetLanguage;

      const aiService = new AIProviderService(settings);

      try {
        const result = await aiService.translate(text, sourceLang, targetLang, providerId);
        
        // If result is the special signal for Window AI, use offscreen
        if (result?.useOffscreen) {
          await ensureOffscreen();
          const offscreenResult = await chrome.runtime.sendMessage({ 
            type: "offscreen-translate", 
            payload: message.payload 
          });
          
          if (offscreenResult?.ok) {
            // offscreenResult is { ok: true, translation: "...", ... }
            // We need to construct the result object expected by content-script
            const resultObj = {
              translation: offscreenResult.translation,
              sourceLanguage: offscreenResult.sourceLanguage,
              targetLanguage: offscreenResult.targetLanguage,
              providerName: offscreenResult.providerName || "Chrome Built-in AI",
              providerType: offscreenResult.providerType || "Built-in"
            };
            
            sendResponse({ ok: true, result: resultObj });
          } else {
            sendResponse({ ok: false, error: offscreenResult?.error || "Unknown error" });
          }
        } else {
          // Result is the object { translation, providerName, providerType }
          sendResponse({ 
            ok: true, 
            result: {
              translation: result.translation,
              providerName: result.providerName,
              providerType: result.providerType,
              sourceLanguage: sourceLang,
              targetLanguage: targetLang
            }
          });
        }
      } catch (err) {
        console.error("Translation Error:", err);
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    });

    return true;
  }

  if (message?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return true;
  }
});

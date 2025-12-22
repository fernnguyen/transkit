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
      nativeLanguageCode: "en",
      targetLanguageCode: "es",
      preferNativeAsSource: true,
      showConfirmModal: true,
      dialogTimeout: 10,
      aliases: {
        e: "en",
        ch: "zh",
        j: "ja"
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
    ensureOffscreen().then(() => {
      chrome.runtime
        .sendMessage({ type: "offscreen-translate", payload: message.payload })
        .then((result) => {
          if (result?.ok) {
            sendResponse({ ok: true, result });
          } else {
            sendResponse({
              ok: false,
              error: result?.error || "Unknown error"
            });
          }
        })
        .catch((err) =>
          sendResponse({ ok: false, error: String(err?.message || err) })
        );
    });

    return true;
  }
});

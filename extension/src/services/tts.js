
export class TTSService {
  constructor() {
    this.audio = new Audio();
    this.currentUrl = null;
  }

  /**
   * Play TTS for the given text and language
   * @param {string} text - Text to speak
   * @param {string} lang - Language code (e.g., 'en', 'vi')
   * @param {number} speed - Speed (0.24 to 4), default 1 (normal)
   */
  async play(text, lang, speed = 1) {
    if (!text) return;

    try {
      // Fetch settings to get active provider
      const { translatorSettings } = await chrome.storage.local.get("translatorSettings");
      const settings = translatorSettings || {};
      
      const activeId = settings.activeTTSProviderId || "google-tts";
      let urlTemplate = "https://translate.google.com/translate_tts?ie=UTF-8&tl={lang}&client=dict-chrome-ex&ttsspeed={speed}&q={text}";
      
      if (activeId !== "google-tts") {
        const provider = settings.ttsProviders?.find(p => p.id === activeId);
        if (provider && provider.url) {
          urlTemplate = provider.url;
        }
      }

      // Send request to background -> offscreen to play audio
      await chrome.runtime.sendMessage({
        type: "tts-play",
        payload: { text, lang, speed, urlTemplate }
      });
    } catch (err) {
      console.error("TTS Play Error:", err);
    }
  }

  stop() {
    // Not easily supported with offscreen fire-and-forget, 
    // but we could send a stop message if needed.
  }
}

export const tts = new TTSService();

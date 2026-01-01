/**
 * Default system prompt for translation with Markdown preservation
 */
const DEFAULT_SYSTEM_PROMPT = `You are a professional translator. Translate the user's text from {sourceLang} to {targetLang}.

RULES:
1. Keep all Markdown symbols (**, _, ~~, \`, \`\`\`, -, <u>) exactly as they are.
2. DO NOT translate content inside backticks (\`...\`) or code blocks (\`\`\`...\`\`\`).
3. Preserve all formatting markers in their original positions.
4. Return ONLY the translated text with preserved Markdown.`;

/**
 * Base class for Translation Providers
 */
class TranslationProvider {
  constructor(config, customPrompt = "") {
    this.config = config;
    this.customPrompt = customPrompt;
  }

  /**
   * Build the complete system prompt with custom additions
   */
  buildSystemPrompt(sourceLang, targetLang) {
    const basePrompt = DEFAULT_SYSTEM_PROMPT
      .replace("{sourceLang}", sourceLang)
      .replace("{targetLang}", targetLang);
    
    if (this.customPrompt && this.customPrompt.trim()) {
      return `${basePrompt}\n\nAdditional context: ${this.customPrompt.trim()}`;
    }
    
    return basePrompt;
  }

  async translate(text, sourceLang, targetLang) {
    throw new Error("Not implemented");
  }
}

/**
 * Chrome Built-in AI Provider
 */
class WindowAIProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    // This delegates to the offscreen document via background script
    // We return a special signal or handle it differently if needed.
    // However, since this runs in background, we can just use the existing flow
    // or we can move the offscreen logic here if we want to unify it.
    // For now, let's keep the offscreen logic separate but invoked by this provider.
    
    // Actually, the background script handles the offscreen messaging.
    // So this provider might just be a wrapper that says "use offscreen".
    return { useOffscreen: true };
  }
}

/**
 * Google Gemini Provider
 */
class GeminiProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    const model = this.config.model || "gemini-pro";
    
    if (!apiKey) throw new Error("Gemini API Key is missing");

    const systemPrompt = this.buildSystemPrompt(sourceLang, targetLang);
    const prompt = `${systemPrompt}\n\nText: ${text}`;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "Gemini API Error");
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    const model = this.config.model || "gpt-3.5-turbo";
    const baseUrl = this.config.baseUrl || "https://api.openai.com/v1";
    
    if (!apiKey) throw new Error("OpenAI API Key is missing");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: this.buildSystemPrompt(sourceLang, targetLang) },
          { role: "user", content: text }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "OpenAI API Error");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  }
}

/**
 * DeepL Provider
 */
class DeepLProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    const isFree = !apiKey.endsWith(":fx"); // Rough check, but DeepL usually distinguishes via domain
    // Actually DeepL API domain depends on plan: api-free.deepl.com vs api.deepl.com
    // But usually keys ending in :fx are free.
    const domain = apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
    
    if (!apiKey) throw new Error("DeepL API Key is missing");

    const params = new URLSearchParams();
    params.append("text", text);
    params.append("source_lang", sourceLang.toUpperCase());
    params.append("target_lang", targetLang.toUpperCase());
    
    const response = await fetch(`https://${domain}/v2/translate`, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      throw new Error("DeepL API Error: " + response.statusText);
    }

    const data = await response.json();
    return data.translations?.[0]?.text;
  }
}

/**
 * Google Translate Provider (Free, no API key required)
 */
class GoogleTranslateProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    console.log('[GoogleTranslate] Received text:', text);
    console.log('[GoogleTranslate] Text length:', text?.length);
    console.log('[GoogleTranslate] Has HTML tags:', /<[a-z][\s\S]*>/i.test(text));
    
    // Google Translate uses ISO 639-1 codes, 'auto' for auto-detect
    const sl = sourceLang === 'auto' ? 'auto' : sourceLang.toLowerCase();
    const tl = targetLang.toLowerCase();
    
    // Encode the text for URL
    const encodedText = encodeURIComponent(text);
    
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1&sl=${sl}&tl=${tl}&q=${encodedText}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Google Translate API Error: " + response.statusText);
    }

    const data = await response.json();
    
    // Parse the response
    // Response contains a "sentences" array where each item has "trans" field
    if (!data.sentences || !Array.isArray(data.sentences)) {
      throw new Error("Invalid response from Google Translate");
    }
    
    // Concatenate all translation segments
    const translation = data.sentences
      .map(sentence => sentence.trans)
      .filter(trans => trans) // Filter out any undefined/null values
      .join('');
    
    return translation;
  }
}

/**
 * Microsoft Translate Provider (Bing) - DISABLED: Requires Authorization
 * Keeping code commented for future reference if auth method is found
 */
// class MicrosoftTranslateProvider extends TranslationProvider {
//   async translate(text, sourceLang, targetLang) {
//     // Microsoft Translate uses ISO 639-1 codes
//     // For auto-detect, leave 'from' parameter empty
//     const from = sourceLang === 'auto' ? '' : sourceLang.toLowerCase();
//     const to = targetLang.toLowerCase();
//     
//     const url = `https://api-edge.cognitive.microsofttranslator.com/translate?from=${from}&to=${to}&api-version=3.0`;
//     
//     // Microsoft Translate expects an array of text objects
//     const requestBody = [{ Text: text }];
//     
//     const response = await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify(requestBody)
//     });
//
//     if (!response.ok) {
//       throw new Error("Microsoft Translate API Error: " + response.statusText);
//     }
//
//     const data = await response.json();
//     
//     // Parse the response
//     // Response is an array where each item has "translations" array
//     if (!Array.isArray(data) || data.length === 0) {
//       throw new Error("Invalid response from Microsoft Translate");
//     }
//     
//     // Extract the translation from the first item
//     const translationItem = data[0];
//     if (!translationItem.translations || translationItem.translations.length === 0) {
//       throw new Error("No translation found in Microsoft Translate response");
//     }
//     
//     return translationItem.translations[0].text;
//   }
// }

/**
 * OpenRouter Provider
 */
class OpenRouterProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    const model = this.config.model || "google/gemini-2.0-flash-exp:free";
    const baseUrl = "https://openrouter.ai/api/v1";
    
    if (!apiKey) throw new Error("OpenRouter API Key is missing");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/fernnguyen/transkit", // Required by OpenRouter
        "X-Title": "TransKit Extension" // Optional
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: this.buildSystemPrompt(sourceLang, targetLang) },
          { role: "user", content: text }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "OpenRouter API Error");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  }
}

/**
 * Groq Provider (Fast inference API)
 */
class GroqProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    const model = this.config.model || "llama-3.3-70b-versatile";
    const baseUrl = "https://api.groq.com/openai/v1";
    
    if (!apiKey) throw new Error("Groq API Key is missing");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: this.buildSystemPrompt(sourceLang, targetLang) },
          { role: "user", content: text }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "Groq API Error");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
  }
}

/**
 * Custom Provider for OpenAI-compatible endpoints (Ollama, LM Studio, etc.)
 */
class CustomProvider extends TranslationProvider {
  async translate(text, sourceLang, targetLang) {
    const apiKey = this.config.apiKey;
    const model = this.config.model || "llama2";
    const baseUrl = this.config.baseUrl || "http://localhost:11434/v1";
    
    if (!baseUrl) throw new Error("Base URL is required for Custom provider");

    const headers = {
      "Content-Type": "application/json"
    };
    
    // Add Authorization header only if API key is provided
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    try {
      console.log(`[CustomProvider] Calling ${baseUrl}/chat/completions with model: ${model}`);
      
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: this.buildSystemPrompt(sourceLang, targetLang) },
            { role: "user", content: text }
          ]
        })
      });

      console.log(`[CustomProvider] Response status: ${response.status}`);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errorMsg = err.error?.message || response.statusText;
        console.error(`[CustomProvider] API Error:`, err);
        throw new Error(`${errorMsg} (Status: ${response.status})`);
      }

      const data = await response.json();
      console.log(`[CustomProvider] Success:`, data);
      return data.choices?.[0]?.message?.content?.trim();
    } catch (error) {
      console.error(`[CustomProvider] Fetch Error:`, error);
      // Check if it's a network/CORS error
      if (error.message.includes('Failed to fetch') || error instanceof TypeError) {
        throw new Error(`Cannot connect to ${baseUrl}. Make sure:\n1. Ollama is running\n2. CORS is enabled\n3. URL is correct`);
      }
      throw error;
    }
  }
}

export class AIProviderService {
  constructor(settings) {
    this.settings = settings;
    this.activeProviderId = settings.activeProviderId || "builtin";
    this.providers = settings.providers || [];
    this.customPrompt = settings.customPrompt || "";
    
    this.activeProvider = this.providers.find(p => p.id === this.activeProviderId) || 
                          this.providers.find(p => p.id === "builtin") ||
                          { type: "gemini-nano", config: {} };
  }

  getProvider(providerId) {
    let providerData = this.activeProvider;
    
    if (providerId) {
      providerData = this.providers.find(p => p.id === providerId) || this.activeProvider;
    }

    const { type, config } = providerData;
    
    switch (type) {
      case "gemini":
        return new GeminiProvider(config, this.customPrompt);
      case "openai":
        return new OpenAIProvider(config, this.customPrompt);
      case "openrouter":
        return new OpenRouterProvider(config, this.customPrompt);
      case "deepl":
        return new DeepLProvider(config, this.customPrompt);
      case "google-translate":
        return new GoogleTranslateProvider(config, this.customPrompt);
      // case "microsoft-translate":
      //   return new MicrosoftTranslateProvider(config, this.customPrompt);
      case "groq":
        return new GroqProvider(config, this.customPrompt);
      case "ollama":
        return new CustomProvider(config, this.customPrompt);
      case "custom":
        return new CustomProvider(config, this.customPrompt);
      case "gemini-nano":
      default:
        return new WindowAIProvider({});
    }
  }

  async translate(text, sourceLang, targetLang, providerId) {
    const provider = this.getProvider(providerId);
    const translation = await provider.translate(text, sourceLang, targetLang);
    
    // If it's the special offscreen signal, return it directly
    if (translation && typeof translation === 'object' && translation.useOffscreen) {
      return translation;
    }

    // Find the actual provider used for metadata
    const providerData = providerId 
      ? (this.providers.find(p => p.id === providerId) || this.activeProvider)
      : this.activeProvider;

    return {
      translation,
      providerName: providerData.name,
      providerType: providerData.type
    };
  }
}

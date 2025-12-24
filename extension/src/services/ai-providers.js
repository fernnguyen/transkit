/**
 * Base class for Translation Providers
 */
class TranslationProvider {
  constructor(config) {
    this.config = config;
  }

  async translate(text, sourceLang, targetLang) {
    throw new Error("Not implemented");
  }
}

/**
 * Window AI Provider (Chrome Built-in)
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

    const prompt = `Translate the following text from ${sourceLang} to ${targetLang}. Only return the translated text, nothing else.\n\nText: ${text}`;
    
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
          { role: "system", content: `You are a professional translator. Translate the user's text from ${sourceLang} to ${targetLang}. Return ONLY the translated text.` },
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
          { role: "system", content: `You are a professional translator. Translate the user's text from ${sourceLang} to ${targetLang}. Return ONLY the translated text.` },
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

export class AIProviderService {
  constructor(settings) {
    this.settings = settings;
    this.activeProviderId = settings.activeProviderId || "builtin";
    this.providers = settings.providers || [];
    
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
        return new GeminiProvider(config);
      case "openai":
        return new OpenAIProvider(config);
      case "openrouter":
        return new OpenRouterProvider(config);
      case "deepl":
        return new DeepLProvider(config);
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

import { normalizeLanguageToCode } from "./common/language-map.js";

let detector;

async function getAvailabilityForPair(sourceLanguage, targetLanguage) {
  if (!("Translator" in self)) return "unsupported";

  try {
    const status = await Translator.availability({
      sourceLanguage,
      targetLanguage
    });
    return status;
  } catch {
    return "unsupported";
  }
}

async function ensureDetector() {
  if (!("LanguageDetector" in self)) return null;

  if (detector) return detector;

  try {
    const availability = await LanguageDetector.availability();

    if (availability === "downloadable" || availability === "after-download") {
      detector = await LanguageDetector.create({
        monitor(m) {
          m.addEventListener("downloadprogress", () => {});
        }
      });

      return detector;
    }

    if (availability === "available") {
      detector = await LanguageDetector.create();
      return detector;
    }
  } catch {}

  return null;
}

async function detectLanguage(text) {
  const d = await ensureDetector();

  if (!d) return null;

  try {
    const results = await d.detect(text);

    if (Array.isArray(results) && results.length > 0) {
      return results[0].detectedLanguage;
    }
  } catch {}

  return null;
}

async function runTranslation(
  text,
  requestedSource,
  requestedTarget,
  preferNativeAsSource
) {
  const target = normalizeLanguageToCode(requestedTarget);

  if (!target) return { ok: false, error: "Invalid target language" };

  let source = normalizeLanguageToCode(requestedSource);
  if (!source) source = null;

  if (!("Translator" in self))
    return { ok: false, error: "Translator API not supported" };

  let finalSource = source;

  if (!finalSource || preferNativeAsSource === false) {
    const detected = await detectLanguage(text);
    finalSource = detected || source || "auto";
  }

  const pairSource = finalSource === "auto" ? undefined : finalSource;
  const availability = await getAvailabilityForPair(pairSource || "en", target);

  if (availability === "unsupported")
    return {
      ok: false,
      error: "Language pair unsupported or model unavailable"
    };

  try {
    const translator = await Translator.create({
      sourceLanguage: pairSource || "auto",
      targetLanguage: target,
      monitor(m) {
        m.addEventListener("downloadprogress", () => {});
      }
    });

    const translated = await translator.translate(text);

    return {
      ok: true,
      translation: translated,
      sourceLanguage: finalSource || "auto",
      targetLanguage: target
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e || "Translation failed")
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "offscreen-translate") {
    const { text, nativeLanguageCode, targetLanguage, preferNativeAsSource } =
      message.payload || {};

    runTranslation(
      text,
      nativeLanguageCode,
      targetLanguage,
      preferNativeAsSource
    )
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) })
      );

    return true;
  }

  return false;
});

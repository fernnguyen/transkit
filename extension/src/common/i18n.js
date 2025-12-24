import { locales } from "./locales.js";

export class I18n {
  constructor() {
    this.language = "en";
    this.locales = locales;
  }

  init(language = "en") {
    this.language = language;
  }

  setLanguage(language) {
    if (this.locales[language]) {
      this.language = language;
    }
  }

  getLanguage() {
    return this.language;
  }

  t(key) {
    // Try direct lookup first (for flat keys like "popup.title")
    let value = this.locales[this.language]?.[key];
    if (value) return value;

    // Fallback to English
    value = this.locales["en"]?.[key];
    if (value) return value;

    return key;
  }
}

export const i18n = new I18n();

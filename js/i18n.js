// Internationalisation. The key of every string is the original English text; locale tables come
// from the original languages.erc (data/locales/<code>.json) plus web strings (web_extra.json).
// t(key, ru) — `ru` is the Russian text of strings made for the web.
import { storage } from './storage.js';

const HTML_LANG = {cz: 'cs', nb: 'nb'};
// Self-names of the 14 languages, shown in the language picker. uk.json is a full table, like ru.json.
export const ENDONYMS = {en: 'English', uk: 'Українська', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano',
  pt: 'Português', nl: 'Nederlands', pl: 'Polski', cz: 'Čeština', sv: 'Svenska', da: 'Dansk', nb: 'Norsk'};
const BROWSER_MAP = {cs: 'cz', no: 'nb', nn: 'nb', nb: 'nb', be: 'ru', kk: 'ru'};

class I18nManager {
  constructor() {
    this.locales = {ru: {}, en: {}};
    this.languages = Object.keys(ENDONYMS).map(code => ({code, name: ENDONYMS[code]}));
    this.loaded = false;
  }

  async loadExtra() {
    this.extra ||= fetch('data/locales/web_extra.json').then(r => r.json()).catch(() => ({_order: []}));
    return this.extra;
  }

  async load(code) {
    if (this.locales[code] && Object.keys(this.locales[code]).length) return this.locales[code];
    let table = {};
    try { table = await (await fetch(`data/locales/${code}.json`)).json(); } catch (e) { console.warn(`Locale ${code}:`, e); }
    const extra = await this.loadExtra(), index = (extra._order || []).indexOf(code);
    if (index >= 0) for (const [key, values] of Object.entries(extra)) if (!key.startsWith('_') && values[index]) table[key] = values[index];
    this.locales[code] = table;
    return table;
  }

  detect() {
    for (const tag of navigator.languages || [navigator.language || 'en']) {
      const base = String(tag).toLowerCase().split('-')[0];
      const code = BROWSER_MAP[base] || base;
      if (ENDONYMS[code]) return code;
    }
    return 'en';
  }

  async init() {
    const settings = storage.getSettings();
    if (!settings.locale || !ENDONYMS[settings.locale]) storage.updateSettings(s => { s.locale = this.detect(); });
    const lang = this.getLang();
    await Promise.all([...new Set(['ru', 'en', lang])].map(code => this.load(code)));
    document.documentElement.lang = HTML_LANG[lang] || lang;
    this.loaded = true;
  }

  t(key, fallback = '') {
    const lang = this.getLang();
    if (lang === 'ru' && fallback) return this.locales.ru?.[key] || fallback;
    const value = this.locales[lang]?.[key];
    if (value) return value;
    if (lang === 'ru') return key;
    return this.locales.en?.[key] || key || fallback;
  }

  getLang() {
    const lang = storage.getSettings().locale;
    return ENDONYMS[lang] ? lang : 'en';
  }

  async setLang(lang) {
    await this.load(lang);
    storage.updateSettings(s => { s.locale = lang; });
    document.documentElement.lang = HTML_LANG[lang] || lang;
  }
}

export const i18n = new I18nManager();
export const t = (en, ru) => i18n.t(en, ru);

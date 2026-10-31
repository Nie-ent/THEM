import i18next, { type i18n as I18n } from 'i18next';
import th from './locales/th.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

export const LOCALES = ['th', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'th';

export const resources = { th: { translation: th }, en: { translation: en } } as const;

/** Single shared instance. React (react-i18next) and Phaser both read from it. */
export const i18n: I18n = i18next.createInstance();

let initPromise: Promise<unknown> | null = null;

export function initI18n(locale: Locale = DEFAULT_LOCALE): Promise<unknown> {
  if (!initPromise) {
    initPromise = i18n.init({
      lng: locale,
      fallbackLng: 'en',
      resources,
      interpolation: { escapeValue: false },
      returnNull: false,
      initAsync: false,
    });
  }
  return initPromise;
}

/** Translate outside React (Phaser scenes, plain TS). Inside React prefer `useTranslation()`. */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

export function setLocale(locale: Locale): Promise<unknown> {
  return i18n.changeLanguage(locale);
}

export function currentLocale(): Locale {
  const l = i18n.language;
  return (LOCALES as readonly string[]).includes(l) ? (l as Locale) : DEFAULT_LOCALE;
}

export { wrapThai, segmentWords } from './wrap';
export { flattenKeys } from './flatten';

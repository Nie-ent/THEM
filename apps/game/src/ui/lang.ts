import { LOCALES, currentLocale, setLocale, type Locale } from '@them/i18n';
import { readStore, writeStore } from './storage';

const KEY = 'them.lang';

/** Stored choice, else `navigator.language` starting with th → Thai, otherwise English (menu spec). */
export function detectLocale(): Locale {
  const saved = readStore(KEY);
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en';
}

export function syncHtmlLang(): void {
  document.documentElement.lang = currentLocale();
}

/** Switch language instantly (no reload), persist it per viewer and keep <html lang> in step. */
export async function applyLocale(l: Locale): Promise<void> {
  await setLocale(l);
  writeStore(KEY, l);
  syncHtmlLang();
}

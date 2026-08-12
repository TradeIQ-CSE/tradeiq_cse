import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const STORAGE_KEY = 'tradeiq.language';

export interface SupportedLanguage {
  /** ISO 639-1 code, also the i18next resource key. */
  code: string;
  /** Label shown in the switcher, always in that language's own script. */
  label: string;
  /**
   * BCP 47 tag driving Intl number/date formatting. Sri Lankan locales, so
   * prices and volumes group the way a CSE user expects in every language.
   */
  locale: string;
  /**
   * Whether a translation catalogue exists yet. Sinhala and Tamil are listed
   * so the switcher matches the design and the plumbing is exercised, but
   * they stay unselectable until a translated catalogue is added — showing
   * untranslated English under a Sinhala label would be worse than saying
   * it isn't ready.
   *
   * To enable one: add `locales/<code>.json`, register it in `resources`
   * below, and flip this to true. Nothing else needs to change.
   */
  available: boolean;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'EN', locale: 'en-LK', available: true },
  { code: 'si', label: 'සිං', locale: 'si-LK', available: false },
  { code: 'ta', label: 'தமிழ்', locale: 'ta-LK', available: false },
];

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0];

const isAvailable = (code: string | undefined): boolean =>
  SUPPORTED_LANGUAGES.some(
    (language) => language.code === code && language.available,
  );

function initialLanguage(): string {
  const stored = window.localStorage?.getItem(STORAGE_KEY);
  if (isAvailable(stored ?? undefined)) return stored as string;
  // Match the browser's preference on first visit, ignoring any region
  // suffix ("si-LK" -> "si"), and fall back to English when that language
  // has no catalogue yet.
  const preferred = navigator.language?.split('-')[0];
  return isAvailable(preferred) ? preferred : DEFAULT_LANGUAGE.code;
}

export function localeFor(languageCode: string): string {
  const match = SUPPORTED_LANGUAGES.find(
    (language) => language.code === languageCode,
  );
  return (match ?? DEFAULT_LANGUAGE).locale;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE.code,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  window.localStorage?.setItem(STORAGE_KEY, language);
  document.documentElement.lang = language;
});

document.documentElement.lang = i18n.language;

export default i18n;

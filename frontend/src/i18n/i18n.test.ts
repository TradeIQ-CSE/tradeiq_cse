import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { STORAGE_KEY, SUPPORTED_LANGUAGES } from './index';

// src/test/setup.ts clears localStorage between tests but does not reset
// the i18next singleton's language, so changeLanguage() here would
// otherwise leak into other test files (including stage 3's page tests).
// Restore whatever language was active before each test explicitly.
let languageBeforeTest: string;

beforeEach(() => {
  languageBeforeTest = i18n.language;
});

afterEach(async () => {
  if (i18n.language !== languageBeforeTest) {
    await i18n.changeLanguage(languageBeforeTest);
  }
});

describe('i18n', () => {
  it('resolves "en" to real strings from the catalogue', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('app.name')).toBe('TradeIQ CSE');
    expect(i18n.t('dashboard')).toBe('Dashboard');
    expect(i18n.t('nav.items.markets')).toBe('Markets');
  });

  it('lists si and ta as unavailable, and en as available', () => {
    const byCode = Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [language.code, language]),
    );

    expect(byCode.en?.available).toBe(true);
    expect(byCode.si?.available).toBe(false);
    expect(byCode.ta?.available).toBe(false);
  });

  it('falls back to en when the stored language is unavailable', async () => {
    localStorage.setItem(STORAGE_KEY, 'si');

    // The fallback happens once, synchronously, at module init time
    // (initialLanguage() inside src/i18n/index.ts). Re-import the module
    // fresh with the "si" value already in localStorage to exercise that
    // path, rather than asserting on the already-initialised singleton.
    vi.resetModules();
    const fresh = await import('./index');

    expect(fresh.default.language).toBe('en');
  });
});

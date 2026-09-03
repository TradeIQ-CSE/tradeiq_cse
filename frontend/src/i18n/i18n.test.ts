import { describe, expect, it, vi } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, STORAGE_KEY, SUPPORTED_LANGUAGES } from './index';

// src/test/setup.ts restores the singleton's language after every test, so
// changeLanguage() here needs no cleanup of its own.

describe('i18n', () => {
  it('resolves "en" to real strings from the catalogue', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('app.name')).toBe('TradeIQ CSE');
    expect(i18n.t('dashboard')).toBe('Dashboard');
    expect(i18n.t('nav.items.markets')).toBe('Markets');
  });

  // This pair proves the shared cleanup in src/test/setup.ts works: the first
  // test leaves a non-default language set, the second asserts it was put back.
  // Nothing else in the suite changes the language yet, so without these the
  // guard would be untested.
  it('can be switched away from the default', async () => {
    await i18n.changeLanguage('si');

    expect(i18n.language).toBe('si');
  });

  it('is restored to the default by the shared cleanup', () => {
    expect(i18n.language).toBe(DEFAULT_LANGUAGE.code);
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

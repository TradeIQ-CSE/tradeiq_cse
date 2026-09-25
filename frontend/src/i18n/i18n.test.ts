import { describe, expect, it, vi } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, STORAGE_KEY, SUPPORTED_LANGUAGES } from './index';
import en from './locales/en.json';
import si from './locales/si.json';

type Catalogue = { [key: string]: string | Catalogue };

/** Every leaf key with the {{placeholders}} its string uses. */
function shape(catalogue: Catalogue, prefix = ''): Record<string, string[]> {
  return Object.entries(catalogue).reduce<Record<string, string[]>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value !== 'string') return { ...out, ...shape(value, path) };
    const placeholders = [...value.matchAll(/{{\s*(\w+)/g)].map((match) => match[1]);
    return { ...out, [path]: [...new Set(placeholders)].sort() };
  }, {});
}

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

  it('lists en and si as available, and ta as not yet', () => {
    const byCode = Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [language.code, language]),
    );

    expect(byCode.en?.available).toBe(true);
    expect(byCode.si?.available).toBe(true);
    expect(byCode.ta?.available).toBe(false);
  });

  it('resolves "si" to Sinhala strings', async () => {
    await i18n.changeLanguage('si');

    expect(i18n.t('nav.items.markets')).toBe('වෙළඳපොළ');
    expect(i18n.t('watchlistPage.list.count', { count: 3, limit: 10 })).toBe('සමාගම් 10 න් 3');
  });

  // A key added to en.json but not si.json would quietly show English on a
  // Sinhala page; a renamed placeholder would show a raw {{name}}.
  it('keeps the Sinhala catalogue in step with English', () => {
    expect(shape(si)).toEqual(shape(en));
  });

  it('falls back to en when the stored language is unavailable', async () => {
    localStorage.setItem(STORAGE_KEY, 'ta');

    // The fallback happens once, synchronously, at module init time
    // (initialLanguage() inside src/i18n/index.ts). Re-import the module
    // fresh with the "ta" value already in localStorage to exercise that
    // path, rather than asserting on the already-initialised singleton.
    vi.resetModules();
    const fresh = await import('./index');

    expect(fresh.default.language).toBe('en');
  });

  it('restores a stored Sinhala choice', async () => {
    localStorage.setItem(STORAGE_KEY, 'si');

    vi.resetModules();
    const fresh = await import('./index');

    expect(fresh.default.language).toBe('si');
  });
});

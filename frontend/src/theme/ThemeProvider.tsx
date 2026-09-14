import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyTheme,
  applyThemeWithTransition,
  useThemeMode,
} from '../components/application/theme/theme-toggle';
import { ThemeContext, ThemeContextValue, ThemePreference } from './useTheme';

// Mirrors the inline script in index.html — keep both in sync if this changes.
const PREFERENCE_STORAGE_KEY = 'tradeiq:theme-preference';

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function storedPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => storedPreference());
  const resolvedTheme = useThemeMode();

  // Applies whenever `preference` changes, mount included — the index.html
  // script only covers first paint, so an explicit light/dark choice still
  // needs applying here too, not just 'system' tracking the OS live.
  useEffect(() => {
    if (preference !== 'system') {
      applyTheme(preference, { persist: false });
      return undefined;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyTheme(media.matches ? 'dark' : 'light', { persist: false });
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [preference]);

  const setPreference = useCallback(
    (next: ThemePreference, origin?: { x: number; y: number } | null) => {
      setPreferenceState(next);
      try {
        window.localStorage.setItem(PREFERENCE_STORAGE_KEY, next);
      } catch {
        // The choice just won't survive a reload when storage is blocked.
      }
      if (next === 'system') {
        // No transition here: this is a mode switch, not a light/dark pick,
        // and may not even change what's on screen.
        applyTheme(systemPrefersDark() ? 'dark' : 'light', { persist: false });
      } else {
        void applyThemeWithTransition(next, { origin });
      }
    },
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

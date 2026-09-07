// Split into its own module (rather than living in ThemeProvider.tsx) so
// that the provider file exports only components — react-refresh/only-export-components
// is `warn` and lint runs --max-warnings 0, and the existing eslint override
// only exempts src/test/**. Mirrors auth/useAuth.ts.

import { createContext, useContext } from 'react';
import type { ThemeMode } from '../components/application/theme/theme-toggle';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  /** What the user asked for. 'system' tracks the OS and is the first-visit default. */
  preference: ThemePreference;
  /** What's actually applied right now — always 'light' or 'dark'. */
  resolvedTheme: ThemeMode;
  setPreference: (preference: ThemePreference, origin?: { x: number; y: number } | null) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

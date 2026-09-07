import { createContext, useContext } from 'react';

export interface TopbarSearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface ShellContextValue {
  topbarSearch: TopbarSearchConfig | null;
  setTopbarSearch: (config: TopbarSearchConfig | null) => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

// A page can render outside the shell — most page-level unit tests do, to
// stay focused on the page's own content — so this falls back to a no-op
// rather than throwing. Search just goes nowhere in that case.
const noopShell: ShellContextValue = {
  topbarSearch: null,
  setTopbarSearch: () => {},
};

export function useShell(): ShellContextValue {
  return useContext(ShellContext) ?? noopShell;
}

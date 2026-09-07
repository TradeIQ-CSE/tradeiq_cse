import { useEffect } from 'react';
import { useShell } from './ShellContext';

/**
 * Publishes a page's search box into the shared topbar. Only one console
 * route owns it at a time (Markets today) — mounting clears whatever the
 * previous route left behind, and unmounting clears its own.
 */
export function useTopbarSearch(value: string, onChange: (value: string) => void, placeholder?: string) {
  const { setTopbarSearch } = useShell();

  useEffect(() => {
    setTopbarSearch({ value, onChange, placeholder });
    return () => setTopbarSearch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, placeholder]);
}

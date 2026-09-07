import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../test/render';
import { ThemeProvider } from './ThemeProvider';
import { ThemeModeControl } from './ThemeModeControl';
import { useTheme } from './useTheme';

const PREFERENCE_KEY = 'tradeiq:theme-preference';

function Probe() {
  const { preference, resolvedTheme } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <ThemeModeControl />
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

// applyTheme (theme-toggle.tsx) mutates document.documentElement directly,
// outside the render container testing-library's cleanup() tears down.
afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('ThemeProvider', () => {
  it('defaults to system on first visit and resolves against the OS (light, per the jsdom matchMedia mock)', () => {
    renderProbe();

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('restores a previously persisted preference instead of defaulting to system', () => {
    localStorage.setItem(PREFERENCE_KEY, 'dark');

    renderProbe();

    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies and persists an explicit dark selection made through the control', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(localStorage.getItem(PREFERENCE_KEY)).toBe('dark');
  });

  it('switching back to system re-resolves against the OS instead of keeping the old explicit choice', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PREFERENCE_KEY, 'dark');
    renderProbe();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'System' }));

    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(localStorage.getItem(PREFERENCE_KEY)).toBe('system');
  });

  it('marks the control reachable and visibly focused via keyboard alone', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.tab();
    const light = screen.getByRole('radio', { name: 'Light' });
    expect(light).toHaveFocus();
  });
});

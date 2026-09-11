import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/render';
import { AppShell } from './AppShell';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('AppShell', () => {
  it('provides one persistent navigation frame and a named main target', () => {
    renderWithProviders(
      <AppShell>
        <h1>Example view</h1>
      </AppShell>,
      { initialEntries: ['/markets'] },
    );

    expect(screen.getByRole('complementary', { name: t('shell.navigationDialog') })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'app-main-content');
    expect(screen.getByRole('link', { name: t('shell.skipToContent') })).toHaveAttribute(
      'href',
      '#app-main-content',
    );
  });

  it('opens and dismisses the accessible mobile navigation dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell>
        <h1>Example view</h1>
      </AppShell>,
      { initialEntries: ['/markets'] },
    );

    await user.click(screen.getByRole('button', { name: t('shell.openNavigation') }));
    expect(screen.getByRole('dialog', { name: t('shell.navigationDialog') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('shell.closeNavigation') }));
    expect(screen.queryByRole('dialog', { name: t('shell.navigationDialog') })).not.toBeInTheDocument();
  });

  it('opens the command palette once from the global keyboard shortcut', async () => {
    const user = userEvent.setup();
    const listener = vi.spyOn(window, 'addEventListener');
    renderWithProviders(
      <AppShell>
        <h1>Example view</h1>
      </AppShell>,
      { initialEntries: ['/markets'] },
    );

    await user.keyboard('{Meta>}k{/Meta}');

    expect(screen.getByRole('dialog', { name: t('nav.commandPalette.title') })).toBeInTheDocument();
    expect(listener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

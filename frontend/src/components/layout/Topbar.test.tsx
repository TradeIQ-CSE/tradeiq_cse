import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/render';
import { ShellContext } from './ShellContext';
import { Topbar } from './Topbar';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

function renderTopbar(initialEntries: string[], topbarSearch: { value: string; onChange: (v: string) => void } | null = null) {
  const onOpenSearch = vi.fn();
  const onMenuClick = vi.fn();
  renderWithProviders(
    <ShellContext.Provider value={{ topbarSearch, setTopbarSearch: () => {} }}>
      <Topbar isMobile={false} onMenuClick={onMenuClick} onOpenSearch={onOpenSearch} />
    </ShellContext.Provider>,
    { initialEntries },
  );
  return { onOpenSearch, onMenuClick };
}

describe('Topbar', () => {
  it('shows the current page in the breadcrumb', () => {
    renderTopbar(['/watchlist']);

    expect(screen.getByText(t('topbar.breadcrumbRoot'))).toBeInTheDocument();
    expect(screen.getByText(t('nav.items.watchlist'))).toHaveAttribute('aria-current', 'page');
  });

  it('resolves a security-detail sub-route to the Markets crumb', () => {
    renderTopbar(['/markets/JKH.N0000']);

    expect(screen.getByText(t('nav.items.markets'))).toHaveAttribute('aria-current', 'page');
  });

  it('opens the command palette from its trigger', async () => {
    const user = userEvent.setup();
    const { onOpenSearch } = renderTopbar(['/markets']);

    await user.click(screen.getByRole('button', { name: t('nav.commandPalette.trigger') }));

    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it('renders a page-published search box and forwards edits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderTopbar(['/markets'], { value: '', onChange });

    const box = screen.getByRole('textbox', { name: t('topbar.searchPlaceholder') });
    await user.type(box, 'JKH');

    expect(onChange).toHaveBeenCalledWith('J');
  });

  it('renders no search box when no page has published one', () => {
    renderTopbar(['/watchlist'], null);

    expect(screen.queryByRole('textbox', { name: t('topbar.searchPlaceholder') })).not.toBeInTheDocument();
  });
});

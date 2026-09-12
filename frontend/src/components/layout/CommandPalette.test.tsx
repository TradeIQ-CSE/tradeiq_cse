import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders, screen } from '../../test/render';
import { CommandPalette } from './CommandPalette';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname}</output>;
}

describe('CommandPalette', () => {
  it('filters results as the query changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette isOpen onOpenChange={() => {}} />);

    expect(screen.getByText(t('nav.items.markets'))).toBeInTheDocument();
    expect(screen.getByText(t('nav.items.watchlist'))).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'watch');

    expect(screen.getByText(t('nav.items.watchlist'))).toBeInTheDocument();
    expect(screen.queryByText(t('nav.items.markets'))).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette isOpen onOpenChange={() => {}} />);

    await user.type(screen.getByRole('textbox'), 'zzz-nonexistent');

    expect(screen.getByText(t('nav.commandPalette.empty'))).toBeInTheDocument();
  });

  it('hides the admin-only route for a non-admin user', () => {
    renderWithProviders(<CommandPalette isOpen onOpenChange={() => {}} />, {
      auth: {
        status: 'authenticated',
        user: { user_id: 'u1', display_name: 'Ada', role: 'investor' },
      },
    });

    expect(screen.queryByText(t('nav.items.admin'))).not.toBeInTheDocument();
  });

  it('keeps planned routes out of primary page search', () => {
    renderWithProviders(<CommandPalette isOpen onOpenChange={() => {}} />);

    expect(screen.queryByText(t('nav.items.aiInsights'))).not.toBeInTheDocument();
    expect(screen.queryByText(t('nav.items.reports'))).not.toBeInTheDocument();
  });

  it('shows the admin-only route for an admin user', () => {
    renderWithProviders(<CommandPalette isOpen onOpenChange={() => {}} />, {
      auth: {
        status: 'authenticated',
        user: { user_id: 'u1', display_name: 'Ada', role: 'admin' },
      },
    });

    expect(screen.getByText(t('nav.items.admin'))).toBeInTheDocument();
  });

  it('navigates to the selected route on Enter and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <>
        <CommandPalette isOpen onOpenChange={onOpenChange} />
        <LocationProbe />
      </>,
    );

    await user.type(screen.getByRole('textbox'), 'watch');
    await user.keyboard('{Enter}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/watchlist');
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<CommandPalette isOpen={false} onOpenChange={() => {}} />);

    expect(screen.queryByText(t('nav.items.markets'))).not.toBeInTheDocument();
  });
});

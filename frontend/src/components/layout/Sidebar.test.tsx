import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/render';
import { Sidebar } from './Sidebar';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('Sidebar profile', () => {
  it('shows the signed-in display name', () => {
    renderWithProviders(<Sidebar />, {
      auth: {
        status: 'authenticated',
        user: { user_id: 'u1', display_name: 'Ama Perera', role: 'investor' },
      },
    });

    expect(screen.getByText('Ama Perera')).toBeInTheDocument();
    expect(screen.getByText(t('auth.signOut'))).toBeInTheDocument();
  });

  it('offers a sign-in link when anonymous', () => {
    renderWithProviders(<Sidebar />, { auth: { status: 'anonymous' } });

    expect(screen.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/login');
    expect(screen.getByText(t('auth.signedOut'))).toBeInTheDocument();
  });

  it('signs out when the profile button is clicked', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<Sidebar />, {
      auth: {
        status: 'authenticated',
        user: { user_id: 'u1', display_name: 'Ama Perera', role: 'investor' },
        logout,
      },
    });

    await user.click(screen.getByRole('button', { name: /Ama Perera/ }));

    expect(logout).toHaveBeenCalledOnce();
  });
});

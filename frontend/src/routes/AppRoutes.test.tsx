import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../test/render';
import { AppRoutes } from './AppRoutes';
import i18n from '../i18n';

const t = i18n.t.bind(i18n);

// Every route component is React.lazy behind a single <Suspense>, so the
// element it eventually renders only appears after a microtask/chunk load —
// findBy* (async) is required, getBy* would race the lazy import.

describe('AppRoutes', () => {
  it('redirects an unknown path to /markets', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/this-page-does-not-exist'] });

    // MarketsPage renders AppShell + its own heading; the heading is the
    // clearest signal that the redirect landed rather than a 404 shell.
    expect(await screen.findByRole('heading', { name: t('markets.title') })).toBeInTheDocument();
  });

  it('renders the planned-feature placeholder for /paper-trading', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/paper-trading'] });

    expect(await screen.findByRole('heading', { name: 'Paper Trading' })).toBeInTheDocument();
    expect(
      screen.getByText('This interface is planned and is not available in the current build.'),
    ).toBeInTheDocument();
  });

  it('redirects a guarded route to /login while anonymous', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/paper-trading'],
      auth: { status: 'anonymous' },
    });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Paper Trading' })).not.toBeInTheDocument();
  });

  it('still renders /markets while anonymous', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/markets'],
      auth: { status: 'anonymous' },
    });

    expect(await screen.findByRole('heading', { name: t('markets.title') })).toBeInTheDocument();
  });
});

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

    // The redirect lands inside ShellLayout's AppShell; MarketsPage's own
    // heading is the clearest signal it landed rather than a 404 shell.
    expect(await screen.findByRole('heading', { name: t('markets.title') })).toBeInTheDocument();
  });

  it('renders the order ticket for /paper-trading', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/paper-trading'] });

    expect(await screen.findByRole('heading', { name: t('paperTrading.page.title') })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: t('paperTrading.ticket.title') }),
    ).toBeInTheDocument();
  });

  it('redirects a guarded route to /login while anonymous', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/paper-trading'],
      auth: { status: 'anonymous' },
    });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t('paperTrading.page.title') })).not.toBeInTheDocument();
  });

  it('still renders /markets while anonymous', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/markets'],
      auth: { status: 'anonymous' },
    });

    expect(await screen.findByRole('heading', { name: t('markets.title') })).toBeInTheDocument();
  });

  it('renders a lowercase security-detail URL publicly with the canonical symbol', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/markets/jkh.n0000'],
      auth: { status: 'anonymous' },
    });

    // This route crosses both a lazy module boundary and the mocked detail
    // request. Give slower CI workers room to resolve both before asserting
    // the canonical API symbol; Testing Library's one-second default made
    // this integration check timing-sensitive under the full suite.
    expect(
      await screen.findByRole(
        'heading',
        { name: 'JKH.N0000' },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, within } from '../../test/render';
import { server } from '../../test/server';
import { securitiesFixture } from '../../test/fixtures/securities';
import type { WatchlistItem } from '../../features/watchlist/api';
import { Watchlist } from './Watchlist';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

function item(symbol: string, overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    symbol,
    company_name: `${symbol} PLC`,
    added_at: '2026-09-01T00:00:00.000Z',
    trade_date: '2026-09-24',
    close: 20,
    change: 0.5,
    change_pct: 2.56,
    ...overrides,
  };
}

function serve(items: WatchlistItem[]) {
  server.use(
    http.get('*/watchlist', () => HttpResponse.json({ data: { limit: 10, items } })),
  );
}

describe('Watchlist page', () => {
  it('shows an empty list with the limit and a way to find companies', async () => {
    renderWithProviders(<Watchlist />);

    expect(screen.getByRole('heading', { name: t('watchlistPage.title') })).toBeInTheDocument();
    expect(await screen.findByText(t('watchlistPage.empty'))).toBeInTheDocument();
    expect(screen.getByText('0 of 10 companies')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('watchlistPage.browse') })).toHaveAttribute(
      'href',
      '/markets',
    );
  });

  it('lists each company with its latest close and change', async () => {
    serve([
      item('JKH.N0000', { change: -0.5, change_pct: -2.44 }),
      item('OLD.N0000', { trade_date: '2026-09-20' }),
      item('NEW.N0000', { trade_date: null, close: null, change: null, change_pct: null }),
    ]);
    renderWithProviders(<Watchlist />);

    const row = (await screen.findByRole('link', { name: 'JKH.N0000' })).closest('tr')!;
    expect(within(row).getByText('JKH.N0000 PLC')).toBeInTheDocument();
    expect(within(row).getByText('LKR 20.00')).toBeInTheDocument();
    // Once in its column and once under the price for phones.
    expect(within(row).getAllByText('-2.44%')).toHaveLength(2);

    expect(screen.getByText('3 of 10 companies · Closing prices from Sep 24, 2026')).toBeInTheDocument();
    // Only the row priced on an earlier day carries its own date.
    const old = screen.getByRole('link', { name: 'OLD.N0000' }).closest('tr')!;
    expect(within(old).getByText('on Sep 20, 2026')).toBeInTheDocument();
    expect(within(row).queryByText(/^on /)).not.toBeInTheDocument();

    const gap = screen.getByRole('link', { name: 'NEW.N0000' }).closest('tr')!;
    expect(within(gap).getByText(t('watchlistPage.dataGap'))).toBeInTheDocument();
  });

  it('adds a company picked from the search', async () => {
    const user = userEvent.setup({ delay: null });
    const added: string[] = [];
    server.use(
      http.post('*/watchlist', async ({ request }) => {
        const { symbol } = (await request.json()) as { symbol: string };
        added.push(symbol);
        // Later reads see the add, as they would from the real API.
        serve([item(symbol)]);
        return HttpResponse.json({ data: { limit: 10, items: [item(symbol)] } });
      }),
    );
    renderWithProviders(<Watchlist />);

    // The search stays disabled until the list has loaded.
    await screen.findByText(t('watchlistPage.empty'));
    const search = screen.getByRole('combobox', { name: t('watchlistPage.add.label') });
    await user.type(search, 'JKH');
    await user.click(
      await screen.findByRole('option', { name: new RegExp(securitiesFixture[0].symbol) }),
    );

    expect(added).toEqual(['JKH.N0000']);
    // The search clears once the company is on the list.
    await waitFor(() => expect(search).toHaveValue(''));
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'JKH.N0000' })).toBeInTheDocument();
  });

  it('replaces the search with the reason when the list is full', async () => {
    serve(Array.from({ length: 10 }, (_, index) => item(`S${index}.N0000`)));
    renderWithProviders(<Watchlist />);

    expect(await screen.findByText(t('watchlistPage.list.full'))).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('removes a company from the star in its row', async () => {
    const user = userEvent.setup();
    const removed: string[] = [];
    serve([item('JKH.N0000'), item('HNB.N0000')]);
    server.use(
      http.delete('*/watchlist/:symbol', ({ params }) => {
        removed.push(params.symbol as string);
        serve([item('HNB.N0000')]);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<Watchlist />);

    await user.click(
      await screen.findByRole('button', {
        name: t('watchlistPage.watch.remove', { symbol: 'JKH.N0000' }),
      }),
    );

    expect(removed).toEqual(['JKH.N0000']);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'JKH.N0000' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'HNB.N0000' })).toBeInTheDocument();
  });

  it('says so when the list cannot load', async () => {
    server.use(
      http.get('*/watchlist', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'x', trace_id: 't' } },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<Watchlist />);

    expect(await screen.findByText(t('watchlistPage.errors.load'))).toBeInTheDocument();
  });
});

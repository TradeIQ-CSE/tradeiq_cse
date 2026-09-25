import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen } from '../../test/render';
import { server } from '../../test/server';
import { WatchButton } from './WatchButton';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

function watchlistOf(symbols: string[]) {
  server.use(
    http.get('*/watchlist', () =>
      HttpResponse.json({
        data: {
          limit: 10,
          items: symbols.map((symbol) => ({
            symbol,
            company_name: symbol,
            added_at: '2026-09-01T00:00:00.000Z',
            trade_date: null,
            close: null,
            change: null,
            change_pct: null,
          })),
        },
      }),
    ),
  );
}

describe('WatchButton', () => {
  it('disables the star with the reason when the list is full', async () => {
    watchlistOf(Array.from({ length: 10 }, (_, index) => `S${index}`));
    renderWithProviders(<WatchButton symbol="JKH.N0000" />);

    const button = await screen.findByRole('button', { name: t('watchlistPage.watch.full') });
    expect(button).toBeDisabled();
  });

  it('still lets a followed company be removed from a full list', async () => {
    watchlistOf(['JKH.N0000', ...Array.from({ length: 9 }, (_, index) => `S${index}`)]);
    renderWithProviders(<WatchButton symbol="JKH.N0000" appearance="label" />);

    const button = await screen.findByRole('button', {
      name: t('watchlistPage.watch.remove', { symbol: 'JKH.N0000' }),
    });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent(t('watchlistPage.watch.following'));
  });
});

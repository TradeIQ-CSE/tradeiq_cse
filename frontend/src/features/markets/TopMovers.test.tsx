import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, within } from '../../test/render';
import { server } from '../../test/server';
import { marketOverviewFixture } from '../../test/fixtures/market-overview';
import { TopMovers } from './TopMovers';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

/** The share bar is the row's first child and carries the width style. */
function barWidth(symbol: string): string {
  const row = screen.getByText(symbol).closest('a');
  if (!row) throw new Error(`row for ${symbol} not found`);
  const bar = row.querySelector('span[aria-hidden="true"]');
  if (!(bar instanceof HTMLElement)) throw new Error('share bar not found');
  return bar.style.width;
}

describe('TopMovers', () => {
  it('shows the gainers list first', async () => {
    renderWithProviders(<TopMovers />);

    expect(await screen.findByText('HNB.N0000')).toBeInTheDocument();
    expect(screen.getByText('JKH.N0000')).toBeInTheDocument();
    // A loser must not leak into the gainers list.
    expect(screen.queryByText('SAMP.N0000')).not.toBeInTheDocument();
  });

  // The bar encodes rank within the visible list, so the strongest mover is
  // full width and the rest are a share of it — not a share of some fixed
  // percentage range, which would leave every bar near-empty on a quiet day.
  it('scales each bar against the strongest mover in the list', async () => {
    renderWithProviders(<TopMovers />);

    await screen.findByText('HNB.N0000');

    // Fixture: +4.00% and +1.00%, so the second bar is a quarter of the first.
    expect(barWidth('HNB.N0000')).toBe('100%');
    expect(barWidth('JKH.N0000')).toBe('25%');
  });

  it('ranks most active by volume rather than percentage change', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopMovers />);

    await screen.findByText('HNB.N0000');
    await user.click(screen.getByRole('radio', { name: t('markets.movers.lists.most_active') }));

    await screen.findByText('DIAL.N0000');
    // 4,000,000 against 1,000,000 — a quarter. Were the bar still scaled on
    // change_pct (0.88 vs -0.37) this row would be far wider.
    expect(barWidth('LOLC.N0000')).toBe('25%');
    // And the figure shown switches from a percentage to a volume.
    const row = screen.getByText('DIAL.N0000').closest('a');
    expect(within(row as HTMLElement).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('reports its own failure without claiming the whole page is down', async () => {
    server.use(http.get('*/market/overview', () => HttpResponse.error()));

    renderWithProviders(<TopMovers />);

    expect(await screen.findByText(t('markets.movers.unreachable'))).toBeInTheDocument();
  });

  it('passes the session and sector through to the API', async () => {
    const requests: URL[] = [];
    server.use(
      http.get('*/market/overview', ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: marketOverviewFixture });
      }),
    );

    renderWithProviders(<TopMovers asOf="2026-08-31" sector="4010" />);

    await waitFor(() => {
      const last = requests.at(-1);
      expect(last?.searchParams.get('as_of')).toBe('2026-08-31');
      expect(last?.searchParams.get('sector')).toBe('4010');
    });
  });

  // An empty string is what the Markets page holds while no filter is chosen;
  // it must never reach the API as `?sector=`.
  it('omits an empty session and sector instead of sending blanks', async () => {
    const requests: URL[] = [];
    server.use(
      http.get('*/market/overview', ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: marketOverviewFixture });
      }),
    );

    renderWithProviders(<TopMovers asOf="" sector="" />);

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests.at(-1)?.searchParams.has('as_of')).toBe(false);
    expect(requests.at(-1)?.searchParams.has('sector')).toBe(false);
  });
});

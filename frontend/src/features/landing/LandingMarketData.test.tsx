import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { server } from '../../test/server';
import { securitiesFixture } from '../../test/fixtures/securities';
import { PREVIEW_FALLBACK } from './preview-fallback';
import { LandingMarketData } from './LandingMarketData';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('LandingMarketData', () => {
  it('renders rows from the securities feed', async () => {
    renderWithProviders(<LandingMarketData />);

    for (const security of securitiesFixture) {
      expect(await screen.findByText(security.symbol)).toBeInTheDocument();
      expect(screen.getByText(security.company_name)).toBeInTheDocument();
    }
  });

  it('requests a page_size of 5', async () => {
    let capturedUrl = '';
    server.use(
      http.get('*/securities', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          data: securitiesFixture,
          meta: { page: 1, page_size: 5, total: securitiesFixture.length },
        });
      }),
    );

    renderWithProviders(<LandingMarketData />);

    await screen.findByText(securitiesFixture[0].symbol);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('page_size')).toBe('5');
  });

  // A landing page that greets a first-time visitor with an error strip is
  // worse than one showing something, so the section falls back rather than
  // reporting the failure.
  it('falls back to the sample when the feed cannot be reached', async () => {
    server.use(http.get('*/securities', () => HttpResponse.error()));

    renderWithProviders(<LandingMarketData />);

    expect(await screen.findByText(PREVIEW_FALLBACK[0].symbol)).toBeInTheDocument();
    expect(screen.queryByText(t('markets.states.unreachable'))).not.toBeInTheDocument();
  });

  // The point of the fallback is that it is never mistaken for the live
  // market. Rows alone are not enough — the card has to say which it is.
  it('marks the fallback as a sample and shows no session date', async () => {
    server.use(http.get('*/securities', () => HttpResponse.error()));

    renderWithProviders(<LandingMarketData />);

    expect(await screen.findByText(t('landing.marketData.sample'))).toBeInTheDocument();
    // A date here would claim a trading session these figures may never have
    // described — the seeded fixture is not documented as real CSE closes.
    expect(screen.queryByText(/as of/i)).not.toBeInTheDocument();
  });

  it('shows the real session date, and no sample badge, on the live path', async () => {
    server.use(
      http.get('*/securities', () =>
        HttpResponse.json({
          data: securitiesFixture,
          meta: { page: 1, page_size: 5, total: 312, as_of: '2026-09-02' },
        }),
      ),
    );

    renderWithProviders(<LandingMarketData />);

    expect(await screen.findByText(t('markets.asOf', { date: '2026-09-02' }))).toBeInTheDocument();
    expect(screen.queryByText(t('landing.marketData.sample'))).not.toBeInTheDocument();
  });

  // An empty list is a legitimate response, but an empty table says nothing
  // about the product, so it takes the fallback too.
  it('falls back when the feed returns no securities', async () => {
    server.use(
      http.get('*/securities', () =>
        HttpResponse.json({ data: [], meta: { page: 1, page_size: 5, total: 0 } }),
      ),
    );

    renderWithProviders(<LandingMarketData />);

    expect(await screen.findByText(t('landing.marketData.sample'))).toBeInTheDocument();
  });

  // The fallback is five fixed rows and has no idea how many securities are
  // listed; claiming a count would be a worse lie than showing none.
  it('claims no listed-securities count on the fallback', async () => {
    server.use(http.get('*/securities', () => HttpResponse.error()));

    renderWithProviders(<LandingMarketData />);

    await screen.findByText(t('landing.marketData.sample'));
    await waitFor(() =>
      expect(screen.getByText(t('landing.marketData.description'))).toBeInTheDocument(),
    );
  });
});

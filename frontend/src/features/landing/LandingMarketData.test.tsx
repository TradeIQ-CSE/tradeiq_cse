import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen } from '../../test/render';
import { server } from '../../test/server';
import { securitiesFixture } from '../../test/fixtures/securities';
import { LandingMarketData } from './LandingMarketData';

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
});

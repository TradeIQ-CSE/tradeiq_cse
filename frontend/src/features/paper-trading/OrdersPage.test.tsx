import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { server } from '../../test/server';
import { renderWithProviders, screen } from '../../test/render';
import { OrdersPage } from './OrdersPage';

const t = i18n.t.bind(i18n);

describe('OrdersPage', () => {
  it('renders the page heading and the empty state for the default portfolio', async () => {
    server.use(
      http.get('*/portfolios/:portfolioId/orders', () =>
        HttpResponse.json({ data: [], meta: { page: 1, page_size: 50, total: 0 } }),
      ),
    );

    renderWithProviders(<OrdersPage />, { initialEntries: ['/orders'] });

    expect(await screen.findByRole('heading', { name: t('orders.page.title') })).toBeInTheDocument();
    expect(await screen.findByText(t('orders.empty'))).toBeInTheDocument();
  });
});

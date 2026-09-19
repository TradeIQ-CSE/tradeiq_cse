import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../test/server';
import { portfolioFixture } from '../../test/fixtures/paper-trading';
import i18n from '../../i18n';
import { renderWithProviders, screen } from '../../test/render';
import { PaperTradingPage } from './PaperTradingPage';

const t = i18n.t.bind(i18n);

describe('PaperTradingPage', () => {
  it('renders the page heading and the order ticket for the default portfolio', async () => {
    renderWithProviders(<PaperTradingPage />, { initialEntries: ['/paper-trading'] });

    expect(await screen.findByRole('heading', { name: t('paperTrading.page.title') })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: t('paperTrading.ticket.title') }),
    ).toBeInTheDocument();
  });

  it('prefills editable setup defaults but creates nothing until explicitly submitted', async () => {
    const create = vi.fn();
    server.use(
      http.get('*/portfolios', () => HttpResponse.json({ data: create.mock.calls.length ? [portfolioFixture] : [], meta: { page: 1, page_size: 50, total: create.mock.calls.length ? 1 : 0 } })),
      http.post('*/portfolios', async ({ request }) => {
        create(await request.json());
        return HttpResponse.json({ data: portfolioFixture }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PaperTradingPage />, { initialEntries: ['/paper-trading'] });
    await user.click(await screen.findByRole('button', { name: t('paperTrading.workflow.configureAccount') }));
    const name = await screen.findByRole('textbox', { name: t('portfolio.create.name') });
    const cash = screen.getByRole('spinbutton', { name: t('portfolio.create.startingCapital') });
    expect(name).toHaveValue('Practice portfolio');
    expect(cash).toHaveValue(1_000_000);
    expect(create).not.toHaveBeenCalled();
    await user.clear(name);
    await user.type(name, 'My practice account');
    await user.clear(cash);
    await user.type(cash, '500000');
    expect(create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.createAccount') }));
    await screen.findByRole('heading', { name: t('paperTrading.ticket.title') });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'My practice account', starting_capital: 500_000 }));
  });
});

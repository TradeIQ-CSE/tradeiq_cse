import { describe, expect, it } from 'vitest';
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
});

import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../../test/render';
import { LANDING_MARKET_PREVIEW } from './market-preview';
import { LandingMarketData } from './LandingMarketData';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('LandingMarketData', () => {
  it('renders the first three fixed preview rows immediately', () => {
    renderWithProviders(<LandingMarketData />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    for (const security of LANDING_MARKET_PREVIEW.slice(0, 3)) {
      expect(screen.getByText(security.symbol)).toBeInTheDocument();
      expect(screen.getByText(security.company_name)).toBeInTheDocument();
    }
  });

  it('uses the security sector as its visual identity instead of a symbol initial', () => {
    renderWithProviders(<LandingMarketData />);

    expect(screen.getAllByRole('img', { name: 'Banks sector' })).toHaveLength(1);
    expect(
      screen.getByRole('img', { name: 'Telecommunication Services sector' }),
    ).toHaveAttribute('data-sector-category', '50');
  });

  it('labels the fixed rows as sample data and claims no session date', () => {
    renderWithProviders(<LandingMarketData />);

    expect(screen.getByText(t('landing.marketData.sample'))).toBeInTheDocument();
    expect(screen.queryByText(/as of/i)).not.toBeInTheDocument();
  });

  it('describes the preview without claiming a listed-securities count', () => {
    renderWithProviders(<LandingMarketData />);

    expect(screen.getByText(t('landing.marketData.sampleNote'))).toBeInTheDocument();
    expect(screen.queryByText(t('landing.marketData.descriptionCounted', { count: 5, formattedCount: '5' }))).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../../test/render';
import i18n from '../../i18n';
import { LandingPaperTrading } from './LandingPaperTrading';

const t = i18n.t.bind(i18n);

describe('LandingPaperTrading', () => {
  it('works the example order through with the real 1.12% CSE fee', () => {
    renderWithProviders(<LandingPaperTrading />);

    expect(screen.getByText('Rs. 20,000.00')).toBeInTheDocument();
    expect(screen.getByText('Rs. 224.00')).toBeInTheDocument();
    expect(screen.getByText('Rs. 20,224.00')).toBeInTheDocument();
    expect(screen.getByText(t('landing.paperTrading.previewNote'))).toBeInTheDocument();
  });

  it('opens paper trading from its call to action', () => {
    renderWithProviders(<LandingPaperTrading />);

    expect(
      screen.getByRole('link', { name: t('landing.paperTrading.cta') }),
    ).toHaveAttribute('href', '/paper-trading');
  });
});

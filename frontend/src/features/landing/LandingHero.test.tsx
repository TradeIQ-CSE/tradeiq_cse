import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '../../test/render';
import i18n from '../../i18n';
import { LandingHero } from './LandingHero';

vi.mock('./LandingBackdrop', () => ({ LandingBackdrop: () => null }));

const t = i18n.t.bind(i18n);

describe('LandingHero', () => {
  it('says what the site does in one headline and what it costs', () => {
    renderWithProviders(<LandingHero />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `${t('landing.hero.headlineLine1')}${t('landing.hero.headlineLine2')}`,
    );
    for (const key of ['free', 'noMoney', 'realData']) {
      expect(screen.getByText(t(`landing.hero.promises.${key}`))).toBeInTheDocument();
    }
  });

  it('opens public market browsing from the primary call to action', () => {
    renderWithProviders(<LandingHero />);

    expect(
      screen.getByRole('link', { name: t('landing.hero.getStarted') }),
    ).toHaveAttribute('href', '/markets');
  });
});

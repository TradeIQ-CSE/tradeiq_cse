import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '../../test/render';
import i18n from '../../i18n';
import { LandingHero } from './LandingHero';

vi.mock('./LandingBackdrop', () => ({ LandingBackdrop: () => null }));

const t = i18n.t.bind(i18n);

describe('LandingHero', () => {
  it('opens public market browsing from the primary call to action', () => {
    renderWithProviders(<LandingHero />);

    expect(
      screen.getByRole('link', { name: t('landing.hero.getStarted') }),
    ).toHaveAttribute('href', '/markets');
  });
});

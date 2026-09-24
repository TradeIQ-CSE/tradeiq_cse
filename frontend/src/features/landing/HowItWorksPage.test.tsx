import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '../../test/render';
import i18n from '../../i18n';
import { HowItWorksPage } from './HowItWorksPage';

vi.mock('@/components/ui/aurora-background', () => ({
  AuroraBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const t = i18n.t.bind(i18n);

describe('HowItWorksPage', () => {
  it('groups every question under its topic', () => {
    renderWithProviders(<HowItWorksPage />);

    for (const group of ['basics', 'backtesting', 'paperTrading', 'data']) {
      expect(
        screen.getByRole('heading', { level: 3, name: t(`howItWorks.faq.groups.${group}`) }),
      ).toBeInTheDocument();
    }
    const items = i18n.getResourceBundle('en', 'translation').howItWorks.faq.items as Record<string, unknown>;
    for (const key of Object.keys(items)) {
      expect(screen.getByText(t(`howItWorks.faq.items.${key}.question`))).toBeInTheDocument();
    }
  });
});

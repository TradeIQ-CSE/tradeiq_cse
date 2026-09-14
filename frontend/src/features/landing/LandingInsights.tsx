import { useTranslation } from 'react-i18next';
import { RiArrowRightUpLine, RiTestTubeLine, RiPieChartLine, RiExchangeLine } from '@remixicon/react';
import { LinkButton } from '@/components/base/buttons/link-button';
import { LANDING_CONTAINER } from './layout';

const CAPABILITIES = [
  { key: 'charting', icon: RiTestTubeLine, href: '/backtests/new/security' },
  { key: 'trading', icon: RiExchangeLine, href: '/paper-trading' },
  { key: 'portfolio', icon: RiPieChartLine, href: '/portfolio' },
] as const;

export function LandingInsights() {
  const { t } = useTranslation();
  return (
    <section id="workspace" className={LANDING_CONTAINER}>
      <div className="landing-glass-panel landing-glass-panel-major rounded-3xl p-6 sm:p-8 lg:p-12">
        <div className="grid items-end gap-5 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-headline-semibold text-status-blue-text">{t('landing.insights.eyebrow')}</p>
            <h2 className="landing-display mt-4 max-w-lg text-display-4-bold text-text-primary sm:text-display-3-bold">{t('landing.insights.heading')}</h2>
          </div>
          <p className="landing-lead max-w-lg text-headline-regular text-text-secondary">{t('landing.insights.description')}</p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {CAPABILITIES.map(({ key, icon: Icon, href }, index) => (
            <li key={key} className="landing-glass-card flex flex-col items-start rounded-3xl p-5 sm:p-6">
              <div className="mb-6 flex w-full items-center justify-between">
                <Icon className="size-6 text-status-blue-text" aria-hidden />
                <span className="text-caption-1-medium text-text-secondary">0{index + 1}</span>
              </div>
              <h3 className="text-title-3-semibold text-text-primary">{t(`landing.insights.capabilities.${key}.title`)}</h3>
              <p className="mb-5 mt-3 text-body-regular text-text-secondary">{t(`landing.insights.capabilities.${key}.description`)}</p>
              <LinkButton href={href} trailingIcon={RiArrowRightUpLine} className="mt-auto text-title-3-semibold text-status-blue-text">
                {t(`landing.insights.capabilities.${key}.cta`)}
              </LinkButton>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

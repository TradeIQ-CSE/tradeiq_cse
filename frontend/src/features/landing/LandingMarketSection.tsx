import { useTranslation } from 'react-i18next';
import { RiArrowRightLine } from '@remixicon/react';
import { LinkButton } from '@/components/base/buttons/link-button';
import { LANDING_CONTAINER } from './layout';
import { LandingMarketData } from './LandingMarketData';

export function LandingMarketSection() {
  const { t } = useTranslation();
  return (
    <section id="market-data" className={LANDING_CONTAINER}>
      <div className="landing-glass-panel landing-glass-panel-major grid items-center gap-10 rounded-3xl p-6 sm:p-8 lg:grid-cols-2 lg:gap-16 lg:p-12">
        <div>
          <p className="text-headline-semibold text-status-blue-text">{t('landing.marketData.eyebrow')}</p>
          <h2 className="landing-display mt-4 text-display-4-bold text-text-primary sm:text-display-3-bold">{t('landing.marketData.headingLine1')}<br />{t('landing.marketData.headingLine2')}</h2>
          <p className="landing-lead mt-5 max-w-lg text-headline-regular text-text-secondary">{t('landing.marketData.overview')}</p>
          <LinkButton href="/markets" trailingIcon={RiArrowRightLine} className="mt-6 text-title-3-semibold text-status-blue-text">{t('landing.marketData.explore')}</LinkButton>
        </div>
        <LandingMarketData />
      </div>
    </section>
  );
}

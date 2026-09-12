import { useTranslation } from 'react-i18next';
import { RiArrowRightLine } from '@remixicon/react';
import { ButtonLink } from '@/components/base/buttons/button';
import { LANDING_CONTAINER } from './layout';

export function LandingCta() {
  const { t } = useTranslation();
  return (
    <section className={LANDING_CONTAINER}>
      <div className="landing-cta-glass flex flex-col items-center gap-8 rounded-3xl px-6 py-16 text-center sm:py-20">
        <div>
          <h2 className="landing-display text-display-4-bold text-text-primary sm:text-display-3-bold">{t('landing.cta.heading')}</h2>
          <p className="landing-lead mx-auto mt-5 max-w-xl text-headline-regular text-text-secondary">{t('landing.cta.subtitle')}</p>
        </div>
        <ButtonLink href="/signup" variant="primary" trailingIcon={RiArrowRightLine}>{t('landing.cta.button')}</ButtonLink>
      </div>
    </section>
  );
}

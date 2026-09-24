import { useTranslation } from 'react-i18next';
import { RiArrowRightLine } from '@remixicon/react';
import { ButtonLink } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { LandingBackdrop } from './LandingBackdrop';
import { LandingPromises } from './LandingPromises';

const HERO_CONTAINER = 'mx-auto w-full max-w-[96rem] px-4 sm:px-6 lg:px-8';

export function LandingHero() {
  const { t } = useTranslation();
  return (
    <section className="landing-hero">
      <div className={HERO_CONTAINER}>
        <div className="landing-hero-media relative isolate overflow-hidden rounded-3xl p-4 text-center sm:px-8 sm:py-10 lg:px-12 lg:py-16">
          <LandingBackdrop />
          <div className="landing-hero-glass relative mx-auto flex max-w-5xl flex-col items-center rounded-3xl px-5 py-10 sm:px-12 sm:py-16">
            <Chip variant="subtle" color="soft" className="landing-media-chip rounded-full px-4 py-1.5 text-headline-medium">{t('landing.hero.badge')}</Chip>
            {/* The one sentence a visitor reads in three seconds. */}
            <h1 className="landing-display landing-hero-title mt-6 max-w-5xl font-bold text-text-primary">
              {t('landing.hero.headlineLine1')}
              <span className="landing-hero-accent block">{t('landing.hero.headlineLine2')}</span>
            </h1>

            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/markets" variant="primary" trailingIcon={RiArrowRightLine}>{t('landing.hero.getStarted')}</ButtonLink>
              <ButtonLink href="/login" variant="secondary" className="landing-media-secondary-button">{t('landing.hero.signIn')}</ButtonLink>
            </div>

            <LandingPromises className="mt-6" />
          </div>
        </div>
      </div>
    </section>
  );
}

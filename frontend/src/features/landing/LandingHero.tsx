import { useTranslation } from 'react-i18next';
import { RiArrowRightLine, RiTimeLine } from '@remixicon/react';
import { ButtonLink } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { LandingBackdrop } from './LandingBackdrop';

const HERO_CONTAINER = 'mx-auto w-full max-w-[96rem] px-4 sm:px-6 lg:px-8';

export function LandingHero() {
  const { t } = useTranslation();
  return (
    <section className="landing-hero">
      <div className={HERO_CONTAINER}>
        <div className="landing-hero-media relative isolate overflow-hidden rounded-3xl p-4 text-center sm:px-8 sm:py-10 lg:px-12 lg:py-16">
          <LandingBackdrop />
          <div className="landing-hero-glass relative mx-auto flex max-w-5xl flex-col items-center rounded-3xl px-5 py-10 sm:px-12 sm:py-20">
            <Chip variant="caption" color="soft" className="landing-media-chip">{t('landing.hero.badge')}</Chip>
            <h1 className="landing-display mt-6 max-w-5xl text-display-4-bold text-text-primary sm:text-display-1-bold lg:text-large-title-bold">
              {t('landing.hero.headlineLine1')}{' '}
              <span className="block">{t('landing.hero.headlineLine2')}</span>
            </h1>
            <p className="landing-lead mt-6 max-w-2xl text-headline-regular text-text-secondary">{t('landing.hero.subtitle')}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/markets" variant="primary">{t('landing.hero.getStarted')}</ButtonLink>
              <ButtonLink href="/login" variant="secondary" trailingIcon={RiArrowRightLine} className="landing-media-secondary-button">{t('landing.hero.signIn')}</ButtonLink>
            </div>
            <p className="mt-6 flex items-center gap-2 text-body-2-medium text-text-secondary"><RiTimeLine className="size-4" aria-hidden />{t('landing.hero.dataNote')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

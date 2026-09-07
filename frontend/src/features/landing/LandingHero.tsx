import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RiTimeLine } from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { Chip } from '../../components/base/badges/chip';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './LandingPage';

/**
 * Headline set solid, not in a gradient.
 *
 * It previously ran through a purple-to-green gradient, which was both the
 * lowest-contrast text on the page and the last purple left in the product.
 *
 * There is no product mockup here any more either. The one that stood in this
 * slot was a drawn facsimile of the app carrying invented prices and an "AI
 * signals" panel for a service that does not exist. The real securities table
 * immediately below is the product view now — it reads from the same
 * GET /securities the Markets screen uses.
 */
export function LandingHero() {
  const { t } = useTranslation();

  return (
    <section className={cx(LANDING_CONTAINER, 'flex flex-col items-center text-center')}>
      <Chip variant="caption" color="soft">
        {t('landing.hero.badge')}
      </Chip>

      <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
        {t('landing.hero.headlineLine1')}{' '}
        <span className="text-status-blue-text">{t('landing.hero.headlineLine2')}</span>
      </h1>

      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">
        {t('landing.hero.subtitle')}
      </p>

      {/* One primary action and one neutral one, per the plan. */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/signup">
          <Button variant="primary" size="medium">
            {t('landing.hero.getStarted')}
          </Button>
        </Link>
        <Link to="/login">
          <Button variant="secondary" size="medium">
            {t('landing.hero.signIn')}
          </Button>
        </Link>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-body-medium text-text-tertiary">
        <RiTimeLine className="size-4" aria-hidden />
        {t('landing.hero.dataNote')}
      </p>
    </section>
  );
}

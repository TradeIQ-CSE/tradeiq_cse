import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RiTimeLine } from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './LandingPage';

export function LandingCta() {
  const { t } = useTranslation();

  return (
    <section className={LANDING_CONTAINER}>
      <div
        className={cx(
          'flex flex-col items-center rounded-3xl border border-border-button-default',
          'bg-background-secondary-default px-6 py-14 text-center',
        )}
      >
        <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl">
          {t('landing.cta.heading')}
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-text-secondary">
          {t('landing.cta.subtitle')}
        </p>

        {/* A link, not a bare <button> that went nowhere. */}
        <Link className="mt-8" to="/signup">
          <Button variant="primary" size="medium">
            {t('landing.cta.button')}
          </Button>
        </Link>

        <p className="mt-6 flex items-center gap-1.5 text-body-medium text-text-tertiary">
          <RiTimeLine className="size-4" aria-hidden />
          {t('landing.cta.dataNote')}
        </p>
      </div>
    </section>
  );
}

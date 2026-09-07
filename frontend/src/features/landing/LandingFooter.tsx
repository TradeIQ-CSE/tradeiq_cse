import { useTranslation } from 'react-i18next';
import { RiLineChartLine } from '@remixicon/react';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './LandingPage';

// Disabled rather than dead: these three have no page behind them yet, and a
// control that silently does nothing is worse than one that says so.
const LINKS = ['privacy', 'terms', 'contact'] as const;

export function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-separator-border bg-background-secondary-default py-10">
      <div
        className={cx(
          LANDING_CONTAINER,
          'flex flex-col items-center gap-6 text-center md:flex-row md:items-start md:justify-between md:text-left',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-background-primary-default">
            <RiLineChartLine className="size-4 text-foreground-icon-primary" aria-hidden />
          </span>
          <span className="text-headline-medium text-text-primary">{t('app.name')}</span>
        </div>

        <p className="max-w-md text-body-regular leading-relaxed text-text-secondary">
          {t('landing.footer.disclaimer')}
        </p>

        <div className="flex items-center gap-4">
          {LINKS.map((link) => (
            <button
              key={link}
              type="button"
              disabled
              title={t('landing.nav.linkUnavailable')}
              className="cursor-not-allowed text-body-medium text-text-disabled"
            >
              {t(`landing.footer.${link}`)}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}

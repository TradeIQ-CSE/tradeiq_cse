import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RiLineChartLine } from '@remixicon/react';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { Button } from '../../components/base/buttons/button';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './LandingPage';

// `href` marks a section that exists; the rest are planned but unbuilt, so they
// render disabled rather than as controls that silently do nothing. Stockbroker
// Firms, Investors and Rules & Circulars were dropped entirely — they mirrored
// cse.lk's nav with no counterpart anywhere in the project scope.
const SITE_LINKS = [
  { key: 'market', href: '/markets' },
  { key: 'newsEvents', href: null },
  { key: 'aboutUs', href: null },
] as const;

export function LandingNav() {
  const { t, i18n } = useTranslation();

  return (
    <header className="sticky top-0 z-30 border-b border-separator-border bg-background-primary-default">
      <div className={cx(LANDING_CONTAINER, 'flex flex-wrap items-center gap-4 py-4')}>
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-background-secondary-default">
            <RiLineChartLine className="size-5 text-foreground-icon-primary" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-headline-medium text-text-primary">
              TradeIQ <span className="text-status-blue-text">CSE</span>
            </span>
            <span className="text-caption-1-medium text-text-tertiary">
              {t('landing.nav.tagline')}
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {SITE_LINKS.map((link) =>
            link.href ? (
              <Link
                key={link.key}
                to={link.href}
                className="rounded-lg px-3 py-1.5 text-body-medium text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary"
              >
                {t(`landing.nav.links.${link.key}`)}
              </Link>
            ) : (
              <button
                key={link.key}
                type="button"
                disabled
                title={t('landing.nav.linkUnavailable')}
                className="cursor-not-allowed rounded-lg px-3 py-1.5 text-body-medium text-text-disabled"
              >
                {t(`landing.nav.links.${link.key}`)}
              </button>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-lg bg-background-secondary-default p-1 sm:flex">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                lang={language.code}
                className={cx(
                  'rounded-md px-2 py-1 text-caption-1-medium',
                  i18n.resolvedLanguage === language.code
                    ? 'bg-background-primary-default text-text-primary shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary',
                  !language.available && 'cursor-not-allowed text-text-disabled',
                )}
                aria-pressed={i18n.resolvedLanguage === language.code}
                disabled={!language.available}
                title={
                  language.available
                    ? undefined
                    : t('nav.languageUnavailable', { language: language.label })
                }
                onClick={() => void i18n.changeLanguage(language.code)}
              >
                {language.label}
              </button>
            ))}
          </div>

          <Link to="/login">
            <Button variant="ghost" size="small">
              {t('landing.nav.signIn')}
            </Button>
          </Link>
          <Link to="/signup">
            <Button variant="primary" size="small">
              {t('landing.nav.openAccount')}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

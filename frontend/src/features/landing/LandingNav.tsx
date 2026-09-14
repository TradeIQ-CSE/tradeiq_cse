import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ButtonLink } from '@/components/base/buttons/button';
import { TradeIqLogo } from '@/components/foundations/brand/tradeiq-logo';
import { ThemeModeControl } from '@/theme/ThemeModeControl';
import { cx } from '@/utils/cx';
import { LANDING_CONTAINER } from './layout';

export function LandingNav() {
  const { t } = useTranslation();
  return (
    <header className="landing-nav-glass sticky top-0 z-30 border-b border-separator-border">
      <div className={cx(LANDING_CONTAINER, 'py-4')}>
        <div className="flex items-center justify-between gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <Link to="/" aria-label="TradeIQ CSE home" className="flex shrink-0 items-center gap-2.5 lg:justify-self-start">
            <TradeIqLogo />
            <span className="hidden text-headline-semibold text-text-primary min-[480px]:inline">TradeIQ <span className="text-status-blue-text">CSE</span></span>
          </Link>
          <nav aria-label={t('landing.nav.label')} className="hidden items-center gap-6 lg:flex">
            <Link to="/markets" className="text-body-medium text-text-secondary hover:text-status-blue-text">{t('landing.nav.links.market')}</Link>
            <Link to="/how-it-works" className="text-body-medium text-text-secondary hover:text-status-blue-text">{t('landing.nav.links.workspace')}</Link>
            <Link to="/backtests/new/security" className="text-body-medium text-text-secondary hover:text-status-blue-text">{t('landing.nav.links.backtesting')}</Link>
          </nav>
          <div className="flex items-center gap-2 lg:justify-self-end">
            <ThemeModeControl compact className="shrink-0" />
            <ButtonLink href="/login" variant="secondary">{t('landing.nav.signIn')}</ButtonLink>
            <ButtonLink href="/signup" variant="primary" className="hidden sm:inline-flex">{t('landing.nav.openAccount')}</ButtonLink>
          </div>
        </div>
        <nav aria-label={t('landing.nav.label')} className="mt-3 flex items-center justify-between gap-4 border-t border-separator-border pt-3 lg:hidden">
          <Link to="/markets" className="text-body-2-medium text-text-secondary hover:text-status-blue-text">{t('landing.nav.links.market')}</Link>
          <Link to="/how-it-works" className="text-body-2-medium text-text-secondary hover:text-status-blue-text">{t('landing.nav.links.workspace')}</Link>
          <Link to="/backtests/new/security" className="text-body-2-medium text-text-secondary hover:text-status-blue-text">{t('landing.nav.links.backtesting')}</Link>
        </nav>
      </div>
    </header>
  );
}

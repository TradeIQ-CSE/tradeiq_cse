import { useTranslation } from 'react-i18next';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './layout';
import { TradeIqLogo } from '@/components/foundations/brand/tradeiq-logo';

export function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="landing-footer-glass border-t border-separator-border py-10">
      <div
        className={cx(
          LANDING_CONTAINER,
          'flex flex-col items-center gap-5 text-center',
        )}
      >
        <div className="flex items-center gap-2.5">
          <TradeIqLogo size="sm" />
          <span className="text-headline-semibold text-text-primary">{t('app.name')}</span>
        </div>

        <p className="max-w-2xl text-body-regular leading-relaxed text-text-secondary">
          {t('landing.footer.disclaimer')}
        </p>
      </div>
    </footer>
  );
}

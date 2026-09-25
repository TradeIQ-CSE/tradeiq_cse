import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { localeFor } from '@/i18n';
import { cx } from '@/utils/cx';
import { formatPrice, formatSigned } from '../markets/format';
import { SecuritySectorIcon } from '../markets/SecuritySectorIcon';
import { LANDING_MARKET_PREVIEW } from './market-preview';

// Enough rows to show what a listing looks like; the Markets page has the rest.
const PREVIEW_ROWS = LANDING_MARKET_PREVIEW.slice(0, 3);

export function LandingMarketData() {
  const { t, i18n } = useTranslation();
  const descriptionId = useId();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  return (
    // Same shell as the backtest and paper-trading example cards: title and a
    // quiet label on top, the note in small type at the bottom left.
    <section
      aria-label={t('landing.marketData.cardTitle')}
      aria-describedby={descriptionId}
      className="landing-glass-card flex min-w-0 flex-col gap-5 rounded-3xl p-5 sm:p-8"
    >
      <div className="flex items-center justify-between gap-4 border-b border-separator-border pb-5">
        <h2 className="text-headline-medium text-text-primary">{t('landing.marketData.cardTitle')}</h2>
        <span className="text-caption-1-medium text-text-secondary">{t('landing.marketData.sample')}</span>
      </div>
      <ul className="-my-2">
        {PREVIEW_ROWS.map((security) => (
          <li key={security.symbol} className="border-b border-separator-border last:border-b-0">
            <Link to={`/markets/${encodeURIComponent(security.symbol)}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-background-secondary-hover">
              <SecuritySectorIcon sector={security.sector} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-body-medium text-text-primary">{security.symbol}</span>
                <span className="truncate text-caption-1-regular text-text-secondary">{security.company_name}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-body-medium tabular-nums text-text-primary">{security.price !== null ? formatPrice(security.price, locale) : t('markets.empty')}</span>
                <span className={cx('text-caption-1-medium tabular-nums', security.change_pct === null || security.change_pct === 0 ? 'text-text-secondary' : security.change_pct > 0 ? 'text-status-lime-text' : 'text-status-rose-text')}>
                  {security.change_pct !== null ? `${formatSigned(security.change_pct, 2, locale)}%` : t('markets.empty')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p id={descriptionId} className="text-caption-1-regular text-text-secondary">
        {t('landing.marketData.sampleNote')}
      </p>
    </section>
  );
}

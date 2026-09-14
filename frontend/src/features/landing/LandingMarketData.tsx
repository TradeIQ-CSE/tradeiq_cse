import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RiArrowRightLine } from '@remixicon/react';
import { localeFor } from '@/i18n';
import { cx } from '@/utils/cx';
import { Chip } from '@/components/base/badges/chip';
import { TradeIqLogo } from '@/components/foundations/brand/tradeiq-logo';
import { formatPrice, formatSigned } from '../markets/format';
import { SecuritySectorIcon } from '../markets/SecuritySectorIcon';
import { LANDING_MARKET_PREVIEW } from './market-preview';

export function LandingMarketData() {
  const { t, i18n } = useTranslation();
  const descriptionId = useId();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  return (
    <section aria-label={t('landing.marketData.cardTitle')} aria-describedby={descriptionId} className="min-w-0">
      <div className="landing-glass-panel landing-glass-panel-dense rounded-3xl p-2 sm:p-3">
        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1 text-caption-1-medium text-text-secondary">
          <span className="flex items-center gap-2"><TradeIqLogo size="sm" className="size-6 rounded-lg" /> TradeIQ / {t('landing.nav.links.market')}</span>
          <span>{t('landing.hero.dataNote')}</span>
        </div>
        <div className="overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator-border p-5">
            <h2 className="text-headline-medium text-text-primary">{t('landing.marketData.cardTitle')}</h2>
            <Chip variant="caption" color="yellow">{t('landing.marketData.sample')}</Chip>
          </div>
          <div className="flex justify-between gap-2 border-b border-separator-border bg-background-secondary-default px-5 py-2 text-caption-1-medium text-text-secondary" aria-hidden>
            <span>{t('landing.marketData.security')}</span><span>{t('landing.marketData.priceLabel')}</span>
          </div>
          <ul>
            {LANDING_MARKET_PREVIEW.map((security) => (
              <li key={security.symbol} className="border-b border-separator-border last:border-b-0">
                <Link to={`/markets/${encodeURIComponent(security.symbol)}`} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-background-secondary-hover sm:px-5">
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
          <Link to="/markets" className="flex items-center justify-between border-t border-separator-border px-5 py-4 text-body-medium text-status-blue-text hover:bg-background-secondary-hover">
            {t('landing.marketData.cta')}<RiArrowRightLine className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
      <div id={descriptionId} className="mt-3 px-3 text-center text-caption-1-regular text-text-secondary">
        <p>{t('landing.marketData.sampleNote')}</p>
        <p>{t('landing.marketData.description')}</p>
      </div>
    </section>
  );
}

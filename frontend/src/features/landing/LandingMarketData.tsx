import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { localeFor } from '../../i18n';
import { cx } from '../../utils/cx';
import { formatCount, formatPrice, formatSigned } from '../markets/format';
import { Chip } from '../../components/base/badges/chip';
import { LANDING_CONTAINER } from './LandingPage';
import { PREVIEW_COUNT, useMarketPreview } from './useMarketPreview';

export function LandingMarketData() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  const { securities, source, asOf, total, isPending } = useMarketPreview();

  return (
    <section className={cx(LANDING_CONTAINER, 'grid items-center gap-10 lg:grid-cols-2')}>
      <div className="flex flex-col items-start">
        <span className="text-body-medium text-status-blue-text">
          {t('landing.marketData.eyebrow')}
        </span>
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl">
          {t('landing.marketData.headingLine1')} {t('landing.marketData.headingLine2')}
        </h2>
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-text-secondary">
          {total !== null
            ? t('landing.marketData.descriptionCounted', {
                count: total,
                formattedCount: formatCount(total, locale),
              })
            : t('landing.marketData.description')}
        </p>
        <Link
          to="/markets"
          className="mt-5 text-body-medium text-status-blue-text hover:underline"
        >
          {t('landing.marketData.cta')}
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator-border px-4 py-3">
          <span className="text-headline-medium text-text-primary">
            {t('landing.marketData.cardTitle')}
          </span>
          {/* The one thing this card must always say: whether these are real
              figures for a real session, or the offline sample. */}
          {source === 'sample' ? (
            <Chip variant="caption" color="yellow">
              {t('landing.marketData.sample')}
            </Chip>
          ) : (
            asOf && (
              <span className="text-body-2-medium text-text-tertiary">
                {t('markets.asOf', { date: asOf })}
              </span>
            )
          )}
        </div>

        {isPending ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: PREVIEW_COUNT }).map((_, index) => (
              <div
                key={index}
                className="h-11 animate-pulse rounded-lg bg-background-tertiary-default"
              />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col">
            {securities.map((security) => {
              const positive = (security.change_pct ?? 0) >= 0;
              return (
                <li
                  key={security.symbol}
                  className="flex items-center gap-3 border-b border-separator-border px-4 py-3 last:border-b-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default text-body-medium text-text-secondary">
                    {security.symbol.charAt(0)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    {/*
                      Full symbol, as on the Markets page: the class suffix is
                      significant (AAF.N0000 and AAF.X0000 are distinct
                      securities), so it must not be trimmed for display.
                    */}
                    <span className="truncate text-body-medium text-text-primary">
                      {security.symbol}
                    </span>
                    <span className="truncate text-body-2-medium text-text-tertiary">
                      {security.company_name}
                    </span>
                  </div>
                  <div className="ml-auto flex flex-col items-end">
                    <span className="text-body-medium tabular-nums text-text-primary">
                      {security.price !== null
                        ? formatPrice(security.price, locale)
                        : t('markets.empty')}
                    </span>
                    {/* No sparkline: the two that used to sit here were a pair
                        of fixed paths, identical for every rising and every
                        falling row, which drew a price history that was not
                        this security's. */}
                    <span
                      className={cx(
                        'text-body-2-medium tabular-nums',
                        positive ? 'text-status-lime-text' : 'text-status-rose-text',
                      )}
                    >
                      {security.change_pct !== null
                        ? `${formatSigned(security.change_pct, 2, locale)}%`
                        : t('markets.empty')}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import { localeFor } from '../../i18n';
import { useSecurities } from '../markets/useSecurities';
import { formatCount, formatPrice, formatSigned } from '../markets/format';

// The landing preview shows the first page of the same GET /securities feed the
// Markets page uses, rather than a hardcoded list: the prices here were being
// read as real by anyone looking at the page.
const PREVIEW_COUNT = 5;

const SPARK_UP = 'M0,18 L7,14 14,15 21,9 28,10 34,2';
const SPARK_DOWN = 'M0,4 L7,8 14,7 21,13 28,12 34,20';

export function LandingMarketData() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  const { data, isPending, isError } = useSecurities({
    sort: 'symbol',
    page: 1,
    page_size: PREVIEW_COUNT,
  });

  const securities = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <section className="landing-market-data">
      <div className="landing-market-data__intro">
        <span className="landing-section-eyebrow">{t('landing.marketData.eyebrow')}</span>
        <h2 className="landing-section-heading">
          <span>{t('landing.marketData.headingLine1')}</span>
          <span>{t('landing.marketData.headingLine2')}</span>
        </h2>
        <p className="landing-section-copy">
          {total > 0
            ? t('landing.marketData.descriptionCounted', {
                count: total,
                formattedCount: formatCount(total, locale),
              })
            : t('landing.marketData.description')}
        </p>
        <a className="landing-section-link" href="/markets">
          {t('landing.marketData.cta')}
        </a>
      </div>

      <div className="landing-market-data__card">
        <div className="landing-market-data__card-head">
          <span className="landing-market-data__card-title">{t('landing.marketData.cardTitle')}</span>
          <div className="landing-market-data__chips">
            <span className="landing-market-data__chip landing-market-data__chip--active">
              {t('markets.filters.all')}
            </span>
          </div>
        </div>

        {isError ? (
          <p className="landing-market-data__state">{t('markets.states.unreachable')}</p>
        ) : isPending ? (
          Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
            <div className="landing-market-data__row landing-market-data__row--skeleton" key={i} />
          ))
        ) : (
          securities.map((security) => {
            const positive = (security.change_pct ?? 0) >= 0;
            return (
              <div key={security.symbol} className="landing-market-data__row">
                <span className="landing-market-data__avatar">{security.symbol.charAt(0)}</span>
                <div className="landing-market-data__name">
                  {/*
                    Full symbol, as on the Markets page: the class suffix is
                    significant (AAF.N0000 and AAF.X0000 are distinct
                    securities), so it must not be trimmed for display.
                  */}
                  <p className="landing-market-data__symbol">{security.symbol}</p>
                  <p className="landing-market-data__company">{security.company_name}</p>
                </div>
                <div className="landing-market-data__price">
                  <p className="landing-market-data__price-value">
                    {security.price !== null ? formatPrice(security.price, locale) : t('markets.empty')}
                  </p>
                  <p
                    className={
                      positive
                        ? 'landing-hero-mockup__index-change--up'
                        : 'landing-hero-mockup__index-change--down'
                    }
                  >
                    {security.change_pct !== null
                      ? `${formatSigned(security.change_pct, 2, locale)}%`
                      : t('markets.empty')}
                  </p>
                </div>
                <svg className="landing-market-data__spark" viewBox="0 0 34 22" aria-hidden="true">
                  <path
                    d={positive ? SPARK_UP : SPARK_DOWN}
                    fill="none"
                    stroke={positive ? 'var(--positive)' : 'var(--negative)'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

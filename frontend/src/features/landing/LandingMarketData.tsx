import { useTranslation } from 'react-i18next';

const SECURITIES = [
  { initial: 'J', symbol: 'JKH', name: 'John Keells Holdings', price: '1199.51', change: '+1.22%', positive: true },
  { initial: 'C', symbol: 'COMB', name: 'Commercial Bank', price: '89.70', change: '-0.89%', positive: false },
  { initial: 'D', symbol: 'DIAL', name: 'Dialog Axiata', price: '12.30', change: '+1.65%', positive: true },
  { initial: 'S', symbol: 'SAMP', name: 'Sampath Bank', price: '45.20', change: '+1.12%', positive: true },
  { initial: 'N', symbol: 'NDB', name: 'National Dev. Bank', price: '92.10', change: '-2.95%', positive: false },
] as const;

const SPARK_UP = 'M0,18 L7,14 14,15 21,9 28,10 34,2';
const SPARK_DOWN = 'M0,4 L7,8 14,7 21,13 28,12 34,20';

export function LandingMarketData() {
  const { t } = useTranslation();

  return (
    <section className="landing-market-data">
      <div className="landing-market-data__intro">
        <span className="landing-section-eyebrow">{t('landing.marketData.eyebrow')}</span>
        <h2 className="landing-section-heading">
          <span>{t('landing.marketData.headingLine1')}</span>
          <span>{t('landing.marketData.headingLine2')}</span>
        </h2>
        <p className="landing-section-copy">{t('landing.marketData.description')}</p>
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
            <span className="landing-market-data__chip">{t('markets.filters.gainers')}</span>
            <span className="landing-market-data__chip">{t('markets.filters.losers')}</span>
          </div>
        </div>

        {SECURITIES.map((security) => (
          <div key={security.symbol} className="landing-market-data__row">
            <span className="landing-market-data__avatar">{security.initial}</span>
            <div className="landing-market-data__name">
              <p className="landing-market-data__symbol">{security.symbol}</p>
              <p className="landing-market-data__company">{security.name}</p>
            </div>
            <div className="landing-market-data__price">
              <p className="landing-market-data__price-value">{security.price}</p>
              <p
                className={
                  security.positive
                    ? 'landing-hero-mockup__index-change--up'
                    : 'landing-hero-mockup__index-change--down'
                }
              >
                {security.change}
              </p>
            </div>
            <svg className="landing-market-data__spark" viewBox="0 0 34 22" aria-hidden="true">
              <path
                d={security.positive ? SPARK_UP : SPARK_DOWN}
                fill="none"
                stroke={security.positive ? 'var(--positive)' : 'var(--negative)'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
      </div>
    </section>
  );
}

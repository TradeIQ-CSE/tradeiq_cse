import { useTranslation } from 'react-i18next';
import modelIcon from '../../assets/icons/model.svg';

type Tone = 'bull' | 'flat' | 'bear';

const PROBABILITIES: { symbol: string; bull: number; flat: number; bear: number; tone: Tone }[] = [
  { symbol: 'JKH', bull: 54, flat: 19, bear: 27, tone: 'bull' },
  { symbol: 'COMB', bull: 32, flat: 38, bear: 30, tone: 'flat' },
  { symbol: 'DIAL', bull: 49, flat: 24, bear: 27, tone: 'bull' },
  { symbol: 'LOLC', bull: 21, flat: 28, bear: 51, tone: 'bear' },
  { symbol: 'HNB', bull: 44, flat: 28, bear: 28, tone: 'bull' },
  { symbol: 'CTC', bull: 35, flat: 38, bear: 27, tone: 'flat' },
];

export function LandingInsights() {
  const { t } = useTranslation();

  return (
    <section className="landing-insights">
      <div className="landing-insights__panel">
        <div className="landing-insights__panel-head">
          <img src={modelIcon} alt="" width={14} height={14} />
          <span className="landing-insights__panel-title">{t('landing.insights.panelTitle')}</span>
          <span className="landing-insights__panel-badge">{t('landing.insights.panelBadge')}</span>
        </div>

        {PROBABILITIES.map((row) => (
          <div key={row.symbol} className="landing-insights__row">
            <span className="landing-insights__symbol">{row.symbol}</span>
            <span className="landing-insights__bar">
              <span className="landing-insights__seg landing-insights__seg--bull" style={{ width: `${row.bull}%` }}>
                {row.bull}%
              </span>
              <span className="landing-insights__seg landing-insights__seg--flat" style={{ width: `${row.flat}%` }}>
                {row.flat}%
              </span>
              <span className="landing-insights__seg landing-insights__seg--bear" style={{ width: `${row.bear}%` }}>
                {row.bear}%
              </span>
            </span>
            <span className={`landing-insights__label landing-insights__label--${row.tone}`}>
              {t(`landing.insights.${row.tone}`)}
            </span>
          </div>
        ))}
      </div>

      <div className="landing-insights__intro">
        <span className="landing-section-eyebrow">{t('landing.insights.eyebrow')}</span>
        <h2 className="landing-section-heading">
          <span>{t('landing.insights.headingLine1')}</span>
          <span>{t('landing.insights.headingLine2')}</span>
        </h2>
        <p className="landing-section-copy">{t('landing.insights.description')}</p>
        <a className="landing-section-link" href="/markets">
          {t('landing.insights.cta')}
        </a>
      </div>
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import boltIcon from '../../assets/icons/bolt.svg';
import flaskIcon from '../../assets/icons/flask.svg';

const WIZARD_STEPS = [
  { key: 'mode', state: 'done' },
  { key: 'strategy', state: 'active' },
  { key: 'market', state: 'todo' },
  { key: 'execution', state: 'todo' },
  { key: 'portfolio', state: 'todo' },
  { key: 'metrics', state: 'todo' },
  { key: 'ai', state: 'todo' },
  { key: 'results', state: 'todo' },
] as const;

const STRATEGIES = [
  { key: 'maCrossover', glyph: '〜', active: true },
  { key: 'rsi', glyph: '⟳', active: false },
  { key: 'macd', glyph: '≋', active: false },
  { key: 'bollinger', glyph: '◈', active: false },
] as const;

export function LandingBacktesting() {
  const { t } = useTranslation();

  return (
    <section className="landing-backtesting">
      <div className="landing-backtesting__intro">
        <span className="landing-section-eyebrow landing-backtesting__eyebrow">
          {t('landing.backtesting.eyebrow')}
        </span>
        <h2 className="landing-section-heading">
          <span>{t('landing.backtesting.headingLine1')}</span>
          <span>{t('landing.backtesting.headingLine2')}</span>
        </h2>
        <p className="landing-section-copy">{t('landing.backtesting.description')}</p>

        <div className="landing-backtesting__card landing-backtesting__card--quick">
          <img className="landing-backtesting__card-icon" src={boltIcon} alt="" width={16} height={16} />
          <div>
            <p className="landing-backtesting__card-title">{t('landing.backtesting.quickTitle')}</p>
            <p className="landing-backtesting__card-description">
              {t('landing.backtesting.quickDescription')}
            </p>
          </div>
        </div>
        <div className="landing-backtesting__card landing-backtesting__card--custom">
          <img className="landing-backtesting__card-icon" src={flaskIcon} alt="" width={16} height={16} />
          <div>
            <p className="landing-backtesting__card-title">{t('landing.backtesting.customTitle')}</p>
            <p className="landing-backtesting__card-description">
              {t('landing.backtesting.customDescription')}
            </p>
          </div>
        </div>

        <a className="landing-section-link landing-backtesting__link" href="/markets">
          {t('landing.backtesting.cta')}
        </a>
      </div>

      <div className="landing-backtesting__panel">
        <div className="landing-backtesting__wizard">
          {WIZARD_STEPS.map((step, i) => (
            <div key={step.key} className="landing-backtesting__wizard-step">
              <span className={`landing-backtesting__wizard-badge landing-backtesting__wizard-badge--${step.state}`}>
                {step.state === 'done' ? '✓' : i + 1}
              </span>
              <span className={`landing-backtesting__wizard-label landing-backtesting__wizard-label--${step.state}`}>
                {t(`landing.backtesting.steps.${step.key}`)}
              </span>
              {i < WIZARD_STEPS.length - 1 && <span className="landing-backtesting__wizard-divider" />}
            </div>
          ))}
        </div>

        <div className="landing-backtesting__body">
          <p className="landing-backtesting__label">{t('landing.backtesting.selectStrategy')}</p>
          <div className="landing-backtesting__strategies">
            {STRATEGIES.map((strategy) => (
              <div
                key={strategy.key}
                className={`landing-backtesting__strategy${
                  strategy.active ? ' landing-backtesting__strategy--active' : ''
                }`}
              >
                <span className="landing-backtesting__strategy-glyph">{strategy.glyph}</span>
                <span>{t(`landing.backtesting.strategies.${strategy.key}`)}</span>
              </div>
            ))}
          </div>

          <div className="landing-backtesting__params">
            <p className="landing-backtesting__params-label">{t('landing.backtesting.parameters')}</p>
            <div className="landing-backtesting__params-grid">
              <div>
                <p className="landing-backtesting__field-label">{t('landing.backtesting.shortMa')}</p>
                <div className="landing-backtesting__field-value">7</div>
              </div>
              <div>
                <p className="landing-backtesting__field-label">{t('landing.backtesting.longMa')}</p>
                <div className="landing-backtesting__field-value">20</div>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-backtesting__results">
          <p className="landing-backtesting__label">{t('landing.backtesting.sampleResults')}</p>
          <div className="landing-backtesting__results-grid">
            <div className="landing-backtesting__stat">
              <p className="landing-backtesting__stat-label">{t('landing.backtesting.totalReturn')}</p>
              <p className="landing-backtesting__stat-value landing-backtesting__stat-value--positive">+58.3%</p>
            </div>
            <div className="landing-backtesting__stat">
              <p className="landing-backtesting__stat-label">{t('landing.backtesting.sharpe')}</p>
              <p className="landing-backtesting__stat-value">1.24</p>
            </div>
            <div className="landing-backtesting__stat">
              <p className="landing-backtesting__stat-label">{t('landing.backtesting.winRate')}</p>
              <p className="landing-backtesting__stat-value">64%</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

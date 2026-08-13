import { useTranslation } from 'react-i18next';

const ALERTS = [
  { key: 'bullish', tone: 'bullish', icon: '↑' },
  { key: 'portfolio', tone: 'warning', icon: '⚠' },
  { key: 'bearish', tone: 'bearish', icon: '↓' },
] as const;

export function LandingAlerts() {
  const { t } = useTranslation();

  return (
    <section className="landing-alerts">
      <div className="landing-alerts__intro">
        <span className="landing-section-eyebrow">{t('landing.alerts.eyebrow')}</span>
        <h2 className="landing-alerts__heading">{t('landing.alerts.heading')}</h2>
      </div>

      <div className="landing-alerts__grid">
        {ALERTS.map((alert) => (
          <div key={alert.key} className={`landing-alerts__card landing-alerts__card--${alert.tone}`}>
            <div className="landing-alerts__card-head">
              <span className={`landing-alerts__icon landing-alerts__icon--${alert.tone}`}>{alert.icon}</span>
              <div>
                <p className="landing-alerts__title">{t(`landing.alerts.items.${alert.key}.title`)}</p>
                <p className="landing-alerts__meta">{t(`landing.alerts.items.${alert.key}.meta`)}</p>
              </div>
            </div>
            <p className="landing-alerts__description">
              {t(`landing.alerts.items.${alert.key}.description`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

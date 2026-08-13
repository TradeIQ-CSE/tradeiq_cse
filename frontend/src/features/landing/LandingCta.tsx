import { useTranslation } from 'react-i18next';
import clockIcon from '../../assets/icons/clock.svg';

export function LandingCta() {
  const { t } = useTranslation();

  return (
    <section className="landing-cta">
      <div className="landing-cta__box">
        <h2 className="landing-cta__heading">{t('landing.cta.heading')}</h2>
        <p className="landing-cta__subtitle">{t('landing.cta.subtitle')}</p>
        <button type="button" className="landing-cta__button">
          {t('landing.cta.button')}
        </button>
        <p className="landing-cta__note">
          <img src={clockIcon} alt="" width={11} height={11} />
          {t('landing.cta.dataNote')}
        </p>
      </div>
    </section>
  );
}

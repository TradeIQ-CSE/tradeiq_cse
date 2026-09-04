import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clockIcon from '../../assets/icons/clock.svg';
import { LandingHeroMockup } from './LandingHeroMockup';

export function LandingHero() {
  const { t } = useTranslation();

  return (
    <section className="landing-hero">
      <div className="landing-hero__intro">
        <span className="landing-hero__badge">{t('landing.hero.badge')}</span>
        <h1 className="landing-hero__heading">
          <span>{t('landing.hero.headlineLine1')}</span>
          <span className="landing-hero__heading-accent">{t('landing.hero.headlineLine2')}</span>
        </h1>
        <p className="landing-hero__subtitle">{t('landing.hero.subtitle')}</p>
        <div className="landing-hero__actions">
          <Link to="/signup" className="landing-hero__cta-primary">
            {t('landing.hero.getStarted')}
          </Link>
          <Link to="/login" className="landing-hero__cta-secondary">
            {t('landing.hero.signIn')}
          </Link>
        </div>
      </div>

      <div className="landing-hero__mockup-wrap">
        <p className="landing-hero__note">
          <img src={clockIcon} alt="" width={11} height={11} />
          {t('landing.hero.dataNote')}
        </p>
        <LandingHeroMockup />
      </div>
    </section>
  );
}

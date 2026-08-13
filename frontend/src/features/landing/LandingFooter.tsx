import { useTranslation } from 'react-i18next';
import logoIcon from '../../assets/icons/logo.svg';

export function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="landing-footer">
      <div className="landing-footer__row">
        <div className="landing-footer__brand">
          <span className="landing-footer__logo">
            <img src={logoIcon} alt="" width={10} height={10} />
          </span>
          <span>{t('app.name')}</span>
        </div>

        <p className="landing-footer__disclaimer">{t('landing.footer.disclaimer')}</p>

        <div className="landing-footer__links">
          <button type="button">{t('landing.footer.privacy')}</button>
          <button type="button">{t('landing.footer.terms')}</button>
          <button type="button">{t('landing.footer.contact')}</button>
        </div>
      </div>
    </footer>
  );
}

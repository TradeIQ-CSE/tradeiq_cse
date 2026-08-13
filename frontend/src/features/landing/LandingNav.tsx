import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import logoIcon from '../../assets/icons/logo.svg';
import searchIcon from '../../assets/icons/search.svg';
import signInIcon from '../../assets/icons/sign-in.svg';
import chevronDownIcon from '../../assets/icons/chevron-down.svg';
import chevronDownActiveIcon from '../../assets/icons/chevron-down-active.svg';

const SITE_LINKS = [
  { key: 'market', active: true },
  { key: 'stockbrokerFirms', active: false },
  { key: 'investors', active: false },
  { key: 'newsEvents', active: false },
  { key: 'rulesCirculars', active: false },
  { key: 'aboutUs', active: false },
] as const;

export function LandingNav() {
  const { t, i18n } = useTranslation();

  return (
    <header className="landing-nav">
      <div className="landing-nav__row">
        <div className="landing-nav__brand">
          <span className="landing-nav__logo">
            <img src={logoIcon} alt="" width={12} height={12} />
          </span>
          <div className="landing-nav__brand-text">
            <p className="landing-nav__brand-name">
              TradeIQ <span>CSE</span>
            </p>
            <p className="landing-nav__brand-tagline">{t('landing.nav.tagline')}</p>
          </div>
        </div>

        <div className="landing-nav__search">
          <img src={searchIcon} alt="" width={11} height={11} />
          <span>{t('topbar.searchPlaceholder')}</span>
        </div>

        <button type="button" className="landing-nav__cta">
          {t('landing.nav.openAccount')}
        </button>
        <button type="button" className="landing-nav__signin">
          <img src={signInIcon} alt="" width={13} height={13} />
          {t('landing.nav.signIn')}
        </button>

        <div className="landing-nav__lang">
          {SUPPORTED_LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              lang={language.code}
              className={`landing-nav__lang-btn${
                i18n.resolvedLanguage === language.code
                  ? ' landing-nav__lang-btn--active'
                  : ''
              }`}
              aria-pressed={i18n.resolvedLanguage === language.code}
              disabled={!language.available}
              title={
                language.available
                  ? undefined
                  : t('nav.languageUnavailable', { language: language.label })
              }
              onClick={() => void i18n.changeLanguage(language.code)}
            >
              {language.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="landing-nav__links">
        {SITE_LINKS.map((link) => (
          <button
            key={link.key}
            type="button"
            className={`landing-nav__link${link.active ? ' landing-nav__link--active' : ''}`}
          >
            {t(`landing.nav.links.${link.key}`)}
            <img
              src={link.active ? chevronDownActiveIcon : chevronDownIcon}
              alt=""
              width={11}
              height={11}
            />
          </button>
        ))}
      </nav>
    </header>
  );
}

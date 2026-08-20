import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import logoIcon from '../../assets/icons/logo.svg';
import searchIcon from '../../assets/icons/search.svg';
import signInIcon from '../../assets/icons/sign-in.svg';

// `href` marks a section that exists; the rest are planned but unbuilt, so they
// render disabled rather than as controls that silently do nothing. Stockbroker
// Firms, Investors and Rules & Circulars were dropped entirely — they mirrored
// cse.lk's nav with no counterpart anywhere in the project scope.
const SITE_LINKS = [
  { key: 'market', href: '/markets' },
  { key: 'newsEvents', href: null },
  { key: 'aboutUs', href: null },
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
          link.href ? (
            <a
              key={link.key}
              href={link.href}
              className="landing-nav__link landing-nav__link--active"
            >
              {t(`landing.nav.links.${link.key}`)}
            </a>
          ) : (
            <button
              key={link.key}
              type="button"
              className="landing-nav__link"
              disabled
              title={t('landing.nav.linkUnavailable')}
            >
              {t(`landing.nav.links.${link.key}`)}
            </button>
          )
        ))}
      </nav>
    </header>
  );
}

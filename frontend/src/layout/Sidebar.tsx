import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { SUPPORTED_LANGUAGES } from '../i18n';
import logoIcon from '../assets/icons/logo.svg';
import marketsIcon from '../assets/icons/markets.svg';
import watchlistIcon from '../assets/icons/watchlist.svg';
import portfolioIcon from '../assets/icons/portfolio.svg';
import tradesIcon from '../assets/icons/trades.svg';
import paperTradingIcon from '../assets/icons/paper-trading.svg';
import backtestingIcon from '../assets/icons/backtesting.svg';
import aiInsightsIcon from '../assets/icons/ai-insights.svg';
import reportsIcon from '../assets/icons/reports.svg';
import settingsIcon from '../assets/icons/settings.svg';
import userMenuIcon from '../assets/icons/user-menu.svg';
import './sidebar.css';

interface NavItem {
  key: string;
  /** Translation key under nav.items. */
  labelKey: string;
  icon: string;
  to?: string;
}

interface NavSection {
  key: string;
  /** Translation key under nav.sections. */
  labelKey: string;
  items: NavItem[];
}

// Only "Markets" is wired to a real route — the rest of the product (per
// docs/adr, TIQ-44 scope) isn't built yet. They're rendered to match the
// Figma shell but are visually disabled rather than dead links.
const NAV_SECTIONS: NavSection[] = [
  {
    key: 'markets',
    labelKey: 'markets',
    items: [
      { key: 'markets', labelKey: 'markets', icon: marketsIcon, to: '/markets' },
      { key: 'watchlist', labelKey: 'watchlist', icon: watchlistIcon },
    ],
  },
  {
    key: 'portfolio',
    labelKey: 'portfolio',
    items: [
      { key: 'portfolio', labelKey: 'portfolio', icon: portfolioIcon },
      { key: 'trades', labelKey: 'trades', icon: tradesIcon },
    ],
  },
  {
    key: 'trading',
    labelKey: 'trading',
    items: [
      {
        key: 'paper-trading',
        labelKey: 'paperTrading',
        icon: paperTradingIcon,
      },
    ],
  },
  {
    key: 'analysis',
    labelKey: 'analysis',
    items: [
      { key: 'backtesting', labelKey: 'backtesting', icon: backtestingIcon },
      { key: 'ai-insights', labelKey: 'aiInsights', icon: aiInsightsIcon },
    ],
  },
  {
    key: 'utilities',
    labelKey: 'utilities',
    items: [{ key: 'reports', labelKey: 'reports', icon: reportsIcon }],
  },
];

export function Sidebar() {
  const { t, i18n } = useTranslation();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo-badge">
          <img src={logoIcon} alt="" width={12} height={12} />
        </span>
        <span className="sidebar__brand-name">{t('app.name')}</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div className="sidebar__section" key={section.key}>
            <p className="sidebar__section-label">
              {t(`nav.sections.${section.labelKey}`)}
            </p>
            {section.items.map((item) =>
              item.to ? (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
                  }
                >
                  <img src={item.icon} alt="" width={13} height={13} />
                  <span>{t(`nav.items.${item.labelKey}`)}</span>
                </NavLink>
              ) : (
                <span
                  key={item.key}
                  className="sidebar__item sidebar__item--disabled"
                  aria-disabled="true"
                >
                  <img src={item.icon} alt="" width={13} height={13} />
                  <span>{t(`nav.items.${item.labelKey}`)}</span>
                </span>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span
          className="sidebar__item sidebar__item--disabled"
          aria-disabled="true"
        >
          <img src={settingsIcon} alt="" width={13} height={13} />
          <span>{t('nav.items.settings')}</span>
        </span>

        <div className="sidebar__language">
          <p className="sidebar__section-label">{t('nav.language')}</p>
          <div className="sidebar__language-toggle">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                lang={language.code}
                className={`sidebar__lang${
                  i18n.resolvedLanguage === language.code
                    ? ' sidebar__lang--active'
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

        <div className="sidebar__profile">
          <span className="sidebar__avatar">N</span>
          <span className="sidebar__profile-text">
            <span className="sidebar__profile-name">Nimesh</span>
            <span className="sidebar__profile-role">
              {t('nav.profile.role')}
            </span>
          </span>
          <img src={userMenuIcon} alt="" width={12} height={12} />
        </div>
      </div>
    </aside>
  );
}

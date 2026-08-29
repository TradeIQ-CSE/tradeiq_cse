import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import aiInsightsIcon from '../../assets/icons/ai-insights.svg';
import backtestingIcon from '../../assets/icons/backtesting.svg';
import logoIcon from '../../assets/icons/logo.svg';
import marketsIcon from '../../assets/icons/markets.svg';
import paperTradingIcon from '../../assets/icons/paper-trading.svg';
import portfolioIcon from '../../assets/icons/portfolio.svg';
import reportsIcon from '../../assets/icons/reports.svg';
import settingsIcon from '../../assets/icons/settings.svg';
import signInIcon from '../../assets/icons/sign-in.svg';
import tradesIcon from '../../assets/icons/trades.svg';
import watchlistIcon from '../../assets/icons/watchlist.svg';
import './sidebar.css';

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
}

interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export function Sidebar({ isMobile = false, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const navigation: NavigationSection[] = [
    {
      label: t('nav.sections.markets'),
      items: [
        { label: t('nav.items.markets'), path: '/markets', icon: marketsIcon },
        {
          label: t('nav.items.watchlist'),
          path: '/watchlist',
          icon: watchlistIcon,
        },
      ],
    },
    {
      label: t('nav.sections.portfolio'),
      items: [
        {
          label: t('nav.items.portfolio'),
          path: '/portfolio',
          icon: portfolioIcon,
        },
        { label: t('nav.items.trades'), path: '/orders', icon: tradesIcon },
      ],
    },
    {
      label: t('nav.sections.trading'),
      items: [
        {
          label: t('nav.items.paperTrading'),
          path: '/paper-trading',
          icon: paperTradingIcon,
        },
      ],
    },
    {
      label: t('nav.sections.analysis'),
      items: [
        {
          label: t('nav.items.backtesting'),
          path: '/analytics',
          icon: backtestingIcon,
        },
        {
          label: t('nav.items.aiInsights'),
          path: '/ai-insights',
          icon: aiInsightsIcon,
        },
      ],
    },
    {
      label: t('nav.sections.utilities'),
      items: [
        { label: t('nav.items.reports'), path: '/reports', icon: reportsIcon },
      ],
    },
  ];

  function openPage(path: string) {
    navigate(path);
    if (isMobile) onClose?.();
  }

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <button
        type="button"
        className="sidebar__brand"
        onClick={() => openPage('/markets')}
      >
        <span className="sidebar__logo">
          <img src={logoIcon} alt="" width={12} height={12} />
        </span>
        <span>{t('app.name')}</span>
      </button>

      <nav className="sidebar__navigation">
        {navigation.map((section) => (
          <section className="sidebar__section" key={section.label}>
            <h2>{section.label}</h2>
            {section.items.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <button
                  type="button"
                  className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => openPage(item.path)}
                  key={item.path}
                >
                  <img src={item.icon} alt="" width={13} height={13} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </section>
        ))}
      </nav>

      <footer className="sidebar__footer">
        <button type="button" className="sidebar__item sidebar__settings" disabled>
          <img src={settingsIcon} alt="" width={13} height={13} />
          <span>{t('nav.items.settings')}</span>
        </button>

        <div className="sidebar__language">
          <span>{t('nav.language')}</span>
          <div className="sidebar__language-options">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                type="button"
                key={language.code}
                className={
                  i18n.resolvedLanguage === language.code
                    ? 'sidebar__language-option sidebar__language-option--active'
                    : 'sidebar__language-option'
                }
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

        <button type="button" className="sidebar__profile" disabled>
          <span className="sidebar__avatar">G</span>
          <span className="sidebar__profile-copy">
            <strong>Guest</strong>
            <small>Not signed in</small>
          </span>
          <img src={signInIcon} alt="" width={13} height={13} />
        </button>
      </footer>
    </aside>
  );
}

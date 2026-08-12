import { NavLink } from 'react-router-dom';
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
  label: string;
  icon: string;
  to?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Only "Markets" is wired to a real route — the rest of the product (per
// docs/adr, TIQ-44 scope) isn't built yet. They're rendered to match the
// Figma shell but are visually disabled rather than dead links.
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Markets',
    items: [
      { key: 'markets', label: 'Markets', icon: marketsIcon, to: '/' },
      { key: 'watchlist', label: 'Watchlist', icon: watchlistIcon },
    ],
  },
  {
    label: 'My Portfolio',
    items: [
      { key: 'portfolio', label: 'Portfolio', icon: portfolioIcon },
      { key: 'trades', label: 'Trades', icon: tradesIcon },
    ],
  },
  {
    label: 'Trading',
    items: [
      { key: 'paper-trading', label: 'Paper Trading', icon: paperTradingIcon },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { key: 'backtesting', label: 'Backtesting', icon: backtestingIcon },
      { key: 'ai-insights', label: 'AI Insights', icon: aiInsightsIcon },
    ],
  },
  {
    label: 'Utilities',
    items: [{ key: 'reports', label: 'Reports', icon: reportsIcon }],
  },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo-badge">
          <img src={logoIcon} alt="" width={12} height={12} />
        </span>
        <span className="sidebar__brand-name">TradeIQ CSE</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div className="sidebar__section" key={section.label}>
            <p className="sidebar__section-label">{section.label}</p>
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
                  <span>{item.label}</span>
                </NavLink>
              ) : (
                <span
                  key={item.key}
                  className="sidebar__item sidebar__item--disabled"
                  aria-disabled="true"
                >
                  <img src={item.icon} alt="" width={13} height={13} />
                  <span>{item.label}</span>
                </span>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__item sidebar__item--disabled" aria-disabled="true">
          <img src={settingsIcon} alt="" width={13} height={13} />
          <span>Settings</span>
        </span>

        <div className="sidebar__language">
          <p className="sidebar__section-label">Language</p>
          <div className="sidebar__language-toggle">
            <button type="button" className="sidebar__lang sidebar__lang--active">
              EN
            </button>
            <button type="button" className="sidebar__lang" disabled>
              සිං
            </button>
            <button type="button" className="sidebar__lang" disabled>
              தமிழ்
            </button>
          </div>
        </div>

        <div className="sidebar__profile">
          <span className="sidebar__avatar">N</span>
          <span className="sidebar__profile-text">
            <span className="sidebar__profile-name">Nimesh</span>
            <span className="sidebar__profile-role">Live trader</span>
          </span>
          <img src={userMenuIcon} alt="" width={12} height={12} />
        </div>
      </div>
    </aside>
  );
}

import type { ComponentType } from 'react';
import {
  RiBarChartGroupedLine,
  RiDashboardLine,
  RiFileChartLine,
  RiFlaskLine,
  RiHistoryLine,
  RiLineChartLine,
  RiPieChartLine,
  RiShieldUserLine,
  RiSparkling2Line,
  RiStarLine,
  RiSwapLine,
} from '@remixicon/react';

export type NavGroupKey = 'markets' | 'portfolio' | 'trading' | 'research' | 'utilities';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export interface NavRoute {
  key: string;
  labelKey: string;
  path: string;
  icon: IconComponent;
  group: NavGroupKey;
  /** Not yet built — retained for direct URLs and breadcrumbs, not primary discovery. */
  planned?: boolean;
  /** Excluded from the sidebar and command palette for non-admins. */
  adminOnly?: boolean;
  /** Optional route-family prefix used by breadcrumbs and selected navigation. */
  activePrefix?: string;
}

export const NAV_GROUPS: { key: NavGroupKey; labelKey: string }[] = [
  { key: 'markets', labelKey: 'nav.sections.markets' },
  { key: 'portfolio', labelKey: 'nav.sections.portfolio' },
  { key: 'trading', labelKey: 'nav.sections.trading' },
  { key: 'research', labelKey: 'nav.sections.analysis' },
  { key: 'utilities', labelKey: 'nav.sections.utilities' },
];

/** Single source of truth for the sidebar, the command palette, and breadcrumbs. */
export const NAV_ROUTES: NavRoute[] = [
  { key: 'markets', labelKey: 'nav.items.markets', path: '/markets', icon: RiLineChartLine, group: 'markets' },
  { key: 'watchlist', labelKey: 'nav.items.watchlist', path: '/watchlist', icon: RiStarLine, group: 'markets' },
  { key: 'dashboard', labelKey: 'nav.items.dashboard', path: '/dashboard', icon: RiDashboardLine, group: 'portfolio' },
  { key: 'portfolio', labelKey: 'nav.items.portfolio', path: '/portfolio', icon: RiPieChartLine, group: 'portfolio' },
  { key: 'trades', labelKey: 'nav.items.trades', path: '/orders', icon: RiSwapLine, group: 'portfolio' },
  {
    key: 'paperTrading',
    labelKey: 'nav.items.paperTrading',
    path: '/paper-trading',
    icon: RiFlaskLine,
    group: 'trading',
  },
  {
    key: 'backtesting',
    labelKey: 'nav.items.backtesting',
    path: '/backtests/new/security',
    activePrefix: '/backtests',
    icon: RiHistoryLine,
    group: 'research',
  },
  { key: 'analytics', labelKey: 'nav.items.analytics', path: '/analytics', icon: RiBarChartGroupedLine, group: 'research' },
  {
    key: 'aiInsights',
    labelKey: 'nav.items.aiInsights',
    path: '/ai-insights',
    icon: RiSparkling2Line,
    group: 'research',
    planned: true,
  },
  {
    key: 'reports',
    labelKey: 'nav.items.reports',
    path: '/reports',
    icon: RiFileChartLine,
    group: 'utilities',
    planned: true,
  },
  {
    key: 'admin',
    labelKey: 'nav.items.admin',
    path: '/admin',
    icon: RiShieldUserLine,
    group: 'utilities',
    adminOnly: true,
  },
];

/** Longest-path-first match: `/markets/:symbol` must not resolve as `/markets`. */
export function navRouteForPath(pathname: string): NavRoute | undefined {
  return [...NAV_ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find(
      (route) =>
        pathname === route.path ||
        pathname.startsWith(`${route.path}/`) ||
        (route.activePrefix !== undefined &&
          (pathname === route.activePrefix || pathname.startsWith(`${route.activePrefix}/`))),
    );
}

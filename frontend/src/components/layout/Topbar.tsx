import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { RiMenuLine } from '@remixicon/react';
import { Breadcrumb, BreadcrumbItem } from '../base/breadcrumb/breadcrumb';
import { Button } from '../base/buttons/button';
import { CompanySearch } from '@/features/markets/CompanySearch';
import { navRouteForPath } from '../../routes/navigation';
import { useShell } from './ShellContext';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { topbarSearch } = useShell();
  const activeRoute = navRouteForPath(pathname);

  return (
    <header className="app-shell-topbar-glass relative z-20 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-app-glass-border px-3 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="secondary"
          iconOnly
          leadingIcon={RiMenuLine}
          aria-label={t('shell.openNavigation')}
          onClick={onMenuClick}
          className="shrink-0 lg:hidden"
        />

        <Breadcrumb className="hidden sm:flex" aria-label={t('topbar.breadcrumbRoot')}>
          <BreadcrumbItem href="/dashboard">{t('topbar.breadcrumbRoot')}</BreadcrumbItem>
          {activeRoute && <BreadcrumbItem current>{t(activeRoute.labelKey)}</BreadcrumbItem>}
        </Breadcrumb>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
        {topbarSearch && (
          <CompanySearch
            variant="topbar"
            placeholder={topbarSearch.placeholder ?? t('topbar.searchPlaceholder')}
            value={topbarSearch.value}
            onChange={topbarSearch.onChange}
            onSelect={(security) => navigate(`/markets/${encodeURIComponent(security.symbol)}`)}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none lg:w-80"
          />
        )}
      </div>
    </header>
  );
}

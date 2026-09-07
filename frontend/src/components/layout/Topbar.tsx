import { MenuOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { RiSearchLine } from '@remixicon/react';
import { Breadcrumb, BreadcrumbItem } from '../base/breadcrumb/breadcrumb';
import { Kbd } from '../base/kbd/kbd';
import { navRouteForPath } from '../../routes/navigation';
import { useShell } from './ShellContext';

interface TopbarProps {
  isMobile: boolean;
  onMenuClick: () => void;
  onOpenSearch: () => void;
}

export function Topbar({ isMobile, onMenuClick, onOpenSearch }: TopbarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { topbarSearch } = useShell();
  const activeRoute = navRouteForPath(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-table px-4">
      <div className="flex min-w-0 items-center gap-3">
        {isMobile && (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={onMenuClick}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-table text-text-secondary"
          >
            <MenuOutlined />
          </button>
        )}

        <Breadcrumb aria-label={t('topbar.breadcrumbRoot')}>
          <BreadcrumbItem href="/markets">{t('topbar.breadcrumbRoot')}</BreadcrumbItem>
          {activeRoute && <BreadcrumbItem current>{t(activeRoute.labelKey)}</BreadcrumbItem>}
        </Breadcrumb>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {topbarSearch && (
          <label className="flex h-9 w-full max-w-70 items-center gap-2 rounded-full border border-border-table bg-background-tertiary-default px-3 focus-within:ring-2 focus-within:ring-border-focus-ring">
            <RiSearchLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <input
              aria-label={topbarSearch.placeholder ?? t('topbar.searchPlaceholder')}
              placeholder={topbarSearch.placeholder ?? t('topbar.searchPlaceholder')}
              value={topbarSearch.value}
              onChange={(event) => topbarSearch.onChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-body-regular text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </label>
        )}

        {!isMobile && (
          <button
            type="button"
            aria-label={t('nav.commandPalette.trigger')}
            onClick={onOpenSearch}
            className="flex h-9 items-center gap-2 rounded-full border border-border-table px-3 text-text-secondary hover:bg-background-secondary-hover"
          >
            <RiSearchLine className="size-4" aria-hidden />
            <Kbd>⌘K</Kbd>
          </button>
        )}
      </div>
    </header>
  );
}

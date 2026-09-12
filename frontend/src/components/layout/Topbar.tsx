import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { RiMenuLine, RiSearchLine } from '@remixicon/react';
import { Breadcrumb, BreadcrumbItem } from '../base/breadcrumb/breadcrumb';
import { Kbd } from '../base/kbd/kbd';
import { Button } from '../base/buttons/button';
import { Input } from '../base/input/input';
import { navRouteForPath } from '../../routes/navigation';
import { useShell } from './ShellContext';

interface TopbarProps {
  onMenuClick: () => void;
  onOpenSearch: () => void;
}

export function Topbar({ onMenuClick, onOpenSearch }: TopbarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { topbarSearch } = useShell();
  const activeRoute = navRouteForPath(pathname);

  return (
    <header className="app-shell-topbar-glass flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-app-glass-border px-3 sm:gap-3 sm:px-4">
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
          <BreadcrumbItem href="/markets">{t('topbar.breadcrumbRoot')}</BreadcrumbItem>
          {activeRoute && <BreadcrumbItem current>{t(activeRoute.labelKey)}</BreadcrumbItem>}
        </Breadcrumb>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
        {topbarSearch && (
          <Input
            aria-label={topbarSearch.placeholder ?? t('topbar.searchPlaceholder')}
            placeholder={topbarSearch.placeholder ?? t('topbar.searchPlaceholder')}
            value={topbarSearch.value}
            onChange={topbarSearch.onChange}
            leadingIcon={RiSearchLine}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none lg:w-80"
            fieldClassName="rounded-full border border-border-button-default bg-background-primary-default"
          />
        )}

        <Button
          variant="secondary"
          leadingIcon={RiSearchLine}
          aria-label={t('nav.commandPalette.trigger')}
          onClick={onOpenSearch}
          className="hidden rounded-full lg:flex"
        >
          <Kbd>⌘K</Kbd>
        </Button>
      </div>
    </header>
  );
}

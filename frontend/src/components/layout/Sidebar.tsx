import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RiCloseLine, RiLogoutBoxRLine, RiSearchLine, RiSettings4Line, RiShieldUserLine } from '@remixicon/react';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../base/avatar/avatar';
import { Kbd } from '../base/kbd/kbd';
import { Dropdown, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from '../base/dropdown/dropdown';
import { ThemeModeControl } from '../../theme/ThemeModeControl';
import { NAV_GROUPS, NAV_ROUTES, NavRoute, navRouteForPath } from '../../routes/navigation';
import { cx } from '../../utils/cx';
import { TradeIqLogo } from '../foundations/brand/tradeiq-logo';
import { Button } from '../base/buttons/button';

function initialOf(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || 'U';
}

interface SidebarProps {
  isMobile?: boolean;
  className?: string;
  onClose?: () => void;
  onOpenSearch: () => void;
}

function NavRow({ route, isMobile, onClose }: { route: NavRoute; isMobile: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const Icon = route.icon;
  const isActive = navRouteForPath(pathname)?.key === route.key;
  return (
    <NavLink
      to={route.path}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => {
        if (isMobile) onClose?.();
      }}
      className={() =>
        cx(
          'flex items-center gap-2 rounded-2lg p-2 text-body-medium transition-colors duration-150 ease',
          isActive
            ? 'bui-on-accent bg-linear-to-b from-accent-500 to-accent-600'
            : 'text-text-secondary hover:bg-background-secondary-hover',
        )
      }
    >
      {() => (
        <>
          <Icon className={cx('size-5 shrink-0', isActive ? 'text-current' : 'text-foreground-icon-secondary')} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t(route.labelKey)}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ isMobile = false, className, onClose, onOpenSearch }: SidebarProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();

  const isAdmin = user?.role === 'admin';
  const primaryGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: NAV_ROUTES.filter((route) => route.group === group.key && !route.planned && !route.adminOnly),
  })).filter((group) => group.items.length > 0);
  const adminItems = NAV_ROUTES.filter((route) => route.adminOnly && isAdmin);

  function openPage(path: string) {
    navigate(path);
    if (isMobile) onClose?.();
  }

  return (
    <aside
      className={cx(
        'flex h-full w-[260px] shrink-0 flex-col justify-between gap-3 overflow-hidden rounded-3xl border border-app-glass-border p-3 shadow-sidebar',
        'app-shell-nav-glass',
        className,
      )}
      aria-label={t('shell.navigationDialog')}
    >
      <div className="-m-2 flex min-h-0 flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2lg p-2 text-left outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            onClick={() => openPage('/markets')}
          >
            <TradeIqLogo size="sm" />
            <span className="truncate text-headline-semibold text-text-primary">{t('app.name')}</span>
          </button>
          {isMobile && (
            <Button
              variant="ghost"
              iconOnly
              leadingIcon={RiCloseLine}
              aria-label={t('shell.closeNavigation')}
              onClick={onClose}
            />
          )}
        </div>

        <button
          type="button"
          aria-label={t('nav.commandPalette.trigger')}
          onClick={() => {
            if (isMobile) onClose?.();
            onOpenSearch();
          }}
          className="flex w-full cursor-pointer items-center gap-2 rounded-full bg-background-tertiary-default p-2 hover:bg-background-tertiary-hover/70"
        >
          <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span className="flex-1 text-left text-body-medium text-text-secondary">
            {t('nav.commandPalette.trigger')}
          </span>
          <Kbd>⌘K</Kbd>
        </button>

        <nav className="flex flex-col gap-3">
          {primaryGroups.map((group) => (
            <section key={group.key} className="flex flex-col gap-1">
              <h2 className="px-2 text-body-medium text-text-tertiary">{t(group.labelKey)}</h2>
              {group.items.map((route) => (
                <NavRow key={route.key} route={route} isMobile={isMobile} onClose={onClose} />
              ))}
            </section>
          ))}

          {adminItems.length > 0 && (
            <section className="flex flex-col gap-1">
              {adminItems.map((route) => (
                <NavRow key={route.key} route={route} isMobile={isMobile} onClose={onClose} />
              ))}
            </section>
          )}
        </nav>
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        <button
          type="button"
          disabled
          className="flex items-center gap-2 rounded-2lg p-2 text-body-medium text-text-tertiary disabled:cursor-not-allowed"
        >
          <RiSettings4Line className="size-5 shrink-0" aria-hidden />
          <span>{t('nav.items.settings')}</span>
        </button>

        <div className="flex items-center justify-between px-2">
          <span className="text-body-regular text-text-tertiary">{t('nav.language')}</span>
          <div className="flex gap-1">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                type="button"
                key={language.code}
                className={cx(
                  'rounded-lg px-2 py-1 text-caption-1-medium',
                  i18n.resolvedLanguage === language.code
                    ? 'bg-background-tertiary-default text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
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

        <ThemeModeControl className="w-full" />

        {user ? (
          <Dropdown>
            <DropdownTrigger
              aria-label={user.display_name}
              className="flex w-full items-center gap-2 rounded-2lg bg-background-tertiary-default p-2 text-left hover:bg-background-tertiary-hover"
            >
              <Avatar size="md" color="blue" initials={initialOf(user.display_name)} />
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className="truncate text-body-medium text-text-primary">{user.display_name}</span>
                <span className="truncate text-body-regular text-text-secondary">{t('nav.profile.role')}</span>
              </span>
            </DropdownTrigger>
            <DropdownPopover aria-label={user.display_name} placement="top start" className="w-[236px]">
              <DropdownGroup>
                {isAdmin && (
                  <DropdownItem onSelect={() => openPage('/admin')}>
                    <RiShieldUserLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                    {t('nav.items.admin')}
                  </DropdownItem>
                )}
                <DropdownItem onSelect={() => void logout()}>
                  <RiLogoutBoxRLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                  {t('auth.signOut')}
                </DropdownItem>
              </DropdownGroup>
            </DropdownPopover>
          </Dropdown>
        ) : (
          <Link
            to="/login"
            onClick={() => {
              if (isMobile) onClose?.();
            }}
            className="flex w-full items-center gap-2 rounded-2lg bg-background-tertiary-default p-2 text-left hover:bg-background-tertiary-hover"
          >
            <Avatar size="md" initials="G" />
            <span className="flex min-w-0 flex-1 flex-col items-start">
              <span className="truncate text-body-medium text-text-primary">{t('auth.login.title')}</span>
              <span className="truncate text-body-regular text-text-secondary">{t('auth.signedOut')}</span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;

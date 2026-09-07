import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RiLogoutBoxRLine, RiSearchLine, RiSettings4Line, RiShieldUserLine } from '@remixicon/react';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../base/avatar/avatar';
import { Kbd } from '../base/kbd/kbd';
import { Dropdown, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from '../base/dropdown/dropdown';
import { ThemeModeControl } from '../../theme/ThemeModeControl';
import { NAV_GROUPS, NAV_ROUTES, NavRoute } from '../../routes/navigation';
import { cx } from '../../utils/cx';
import logoIcon from '../../assets/icons/logo.svg';

function initialOf(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || 'U';
}

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
  onOpenSearch: () => void;
}

function NavRow({ route, isMobile, onClose, muted = false }: { route: NavRoute; isMobile: boolean; onClose?: () => void; muted?: boolean }) {
  const { t } = useTranslation();
  const Icon = route.icon;
  return (
    <NavLink
      to={route.path}
      onClick={() => {
        if (isMobile) onClose?.();
      }}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2 rounded-2lg p-2 text-body-medium transition-colors duration-150 ease',
          isActive
            ? 'bg-linear-to-b from-accent-500 to-accent-600 text-white'
            : muted
              ? 'text-text-tertiary hover:bg-background-secondary-hover hover:text-text-secondary'
              : 'text-text-secondary hover:bg-background-secondary-hover',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('size-5 shrink-0', isActive ? 'text-white' : 'text-foreground-icon-secondary')} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t(route.labelKey)}</span>
          {route.planned && !isActive && (
            <span className="shrink-0 rounded-full bg-background-tertiary-default px-1.5 py-0.5 text-caption-2-medium whitespace-nowrap text-text-tertiary">
              {t('nav.items.planned')}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ isMobile = false, onClose, onOpenSearch }: SidebarProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();

  const isAdmin = user?.role === 'admin';
  const primaryGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: NAV_ROUTES.filter((route) => route.group === group.key && !route.planned && !route.adminOnly),
  })).filter((group) => group.items.length > 0);
  const plannedItems = NAV_ROUTES.filter((route) => route.planned);
  const adminItems = NAV_ROUTES.filter((route) => route.adminOnly && isAdmin);

  function openPage(path: string) {
    navigate(path);
    if (isMobile) onClose?.();
  }

  return (
    <aside
      className={cx(
        'flex h-full w-[260px] shrink-0 flex-col justify-between gap-3 overflow-hidden p-3',
        !isMobile && 'rounded-3xl border border-border-table bg-background-secondary-default shadow-sidebar',
      )}
      aria-label="Primary navigation"
    >
      <div className="-m-2 flex min-h-0 flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        <button
          type="button"
          className="flex items-center gap-2 rounded-2lg p-2 text-left outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          onClick={() => openPage('/markets')}
        >
          <img src={logoIcon} alt="" width={20} height={20} />
          <span className="text-headline-semibold text-text-primary">{t('app.name')}</span>
        </button>

        <button
          type="button"
          aria-label={t('nav.commandPalette.trigger')}
          onClick={onOpenSearch}
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

          {plannedItems.length > 0 && (
            <section className="flex flex-col gap-1">
              <h2 className="px-2 text-body-medium text-text-tertiary">{t('nav.items.planned')}</h2>
              {plannedItems.map((route) => (
                <NavRow key={route.key} route={route} isMobile={isMobile} onClose={onClose} muted />
              ))}
            </section>
          )}

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

        <ThemeModeControl className="w-full justify-between" />

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

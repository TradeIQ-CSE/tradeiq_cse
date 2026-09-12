import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { RiSearchLine } from '@remixicon/react';
import { useAuth } from '../../auth/useAuth';
import { NAV_ROUTES } from '../../routes/navigation';
import { cx } from '../../utils/cx';

interface CommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Route search, opened by the sidebar/topbar trigger or the ⌘K / Ctrl+K
 * shortcut (registered once in AppShell). No <DialogTrigger> here for the
 * same reason as DesignSystemPreview's dialog: this is opened from plain
 * onClick handlers and a keydown listener, not a React Aria pressable, so
 * ModalOverlay is controlled directly via isOpen/onOpenChange.
 */
export function CommandPalette({ isOpen, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return NAV_ROUTES.filter((route) => !route.planned)
      .filter((route) => !route.adminOnly || user?.role === 'admin')
      .filter((route) => t(route.labelKey).toLocaleLowerCase().includes(normalized));
  }, [query, t, user?.role]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results.length]);

  function go(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-start justify-center bg-app-overlay px-3 pt-[15vh]"
    >
      <Modal className="w-full max-w-md overflow-hidden rounded-2xl border border-border-table bg-background-primary-default shadow-dropdown">
        <Dialog aria-label={t('nav.commandPalette.title')} className="outline-none">
          <div className="flex items-center gap-2 border-b border-border-table px-4 py-3">
            <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, results.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter' && results[activeIndex]) {
                  event.preventDefault();
                  go(results[activeIndex].path);
                }
              }}
              placeholder={t('nav.commandPalette.placeholder')}
              aria-label={t('nav.commandPalette.placeholder')}
              className="w-full bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-2" role="listbox" aria-label={t('nav.commandPalette.title')}>
            {results.length === 0 && (
              <li className="px-2 py-3 text-body-regular text-text-tertiary">{t('nav.commandPalette.empty')}</li>
            )}
            {results.map((route, index) => {
              const Icon = route.icon;
              return (
                <li key={route.key} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onClick={() => go(route.path)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cx(
                      'flex w-full items-center gap-2.5 rounded-2lg p-2 text-left text-body-medium text-text-primary outline-none',
                      index === activeIndex && 'bg-background-secondary-hover',
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                    {t(route.labelKey)}
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

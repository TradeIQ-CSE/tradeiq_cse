import { useCallback, useEffect, useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { ShellContext, TopbarSearchConfig } from './ShellContext';
import { AppBackdrop } from './AppBackdrop';
import { useTranslation } from 'react-i18next';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [topbarSearch, setTopbarSearch] = useState<TopbarSearchConfig | null>(null);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openPalette();
      }
    }
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [openPalette]);

  return (
    <ShellContext.Provider value={{ topbarSearch, setTopbarSearch }}>
      <a className="app-skip-link" href="#app-main-content">
        {t('shell.skipToContent')}
      </a>
      <div className="app-shell relative flex h-dvh w-full gap-3 overflow-hidden p-0 sm:p-3">
        <AppBackdrop />
        <Sidebar className="relative z-10 hidden lg:flex" onOpenSearch={openPalette} />

        <ModalOverlay
          isOpen={drawerVisible}
          onOpenChange={setDrawerVisible}
          isDismissable
          className="fixed inset-0 z-50 flex bg-app-overlay p-3 lg:hidden"
        >
          <Modal className="h-full w-full max-w-80 outline-none">
            <Dialog aria-label={t('shell.navigationDialog')} className="h-full outline-none">
              <Sidebar
                isMobile
                className="app-shell-nav-glass w-full"
                onClose={() => setDrawerVisible(false)}
                onOpenSearch={openPalette}
              />
            </Dialog>
          </Modal>
        </ModalOverlay>

        <div className="app-shell-workspace relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden sm:rounded-3xl sm:border sm:border-app-glass-border sm:shadow-sidebar">
          <Topbar
            onMenuClick={() => setDrawerVisible(true)}
            onOpenSearch={openPalette}
          />
          <main
            id="app-main-content"
            className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:p-5 lg:p-6"
          >
            <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} />
    </ShellContext.Provider>
  );
}

export default AppShell;

import { useCallback, useEffect, useState } from 'react';
import { Drawer, Grid } from 'antd';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { ShellContext, TopbarSearchConfig } from './ShellContext';
import { cx } from '../../utils/cx';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const screens = Grid.useBreakpoint();
  // md is false when viewport < 768px (i.e. mobile sizes)
  const isMobile = screens.md === false;
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
      <div className={cx('flex h-screen w-full bg-background-primary-default', !isMobile && 'gap-3 p-3')}>
        {isMobile ? (
          <Drawer
            placement="left"
            onClose={() => setDrawerVisible(false)}
            open={drawerVisible}
            styles={{ body: { padding: 0 } }}
            width={260}
            closable={false}
          >
            <Sidebar isMobile onClose={() => setDrawerVisible(false)} onOpenSearch={openPalette} />
          </Drawer>
        ) : (
          <Sidebar onOpenSearch={openPalette} />
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            isMobile={isMobile}
            onMenuClick={() => setDrawerVisible(true)}
            onOpenSearch={openPalette}
          />
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} />
    </ShellContext.Provider>
  );
}

export default AppShell;

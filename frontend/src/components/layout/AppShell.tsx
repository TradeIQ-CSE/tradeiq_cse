import React, { useState } from 'react';
import { Layout, Drawer, Grid } from 'antd';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import './app-shell.css';

const { Content } = Layout;

interface AppShellProps {
  children: React.ReactNode;
  search?: string;
  onSearchChange?: (value: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  search,
  onSearchChange,
}) => {
  const screens = Grid.useBreakpoint();
  // md is false when viewport < 768px (i.e. mobile sizes)
  const isMobile = screens.md === false;
  const [drawerVisible, setDrawerVisible] = useState(false);

  const toggleDrawer = () => setDrawerVisible((visible) => !visible);

  return (
    <Layout className="app-shell">
      {isMobile ? (
        <Drawer
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          styles={{ body: { padding: 0, backgroundColor: 'var(--bg-panel)' } }}
          width={192}
          closable={false}
        >
          <Sidebar isMobile onClose={() => setDrawerVisible(false)} />
        </Drawer>
      ) : (
        <Layout.Sider
          width={192}
          theme="dark"
          className="app-shell__sider"
          trigger={null}
        >
          <Sidebar />
        </Layout.Sider>
      )}

      <Layout className={`app-shell__main${isMobile ? ' app-shell__main--mobile' : ''}`}>
        <Topbar
          isMobile={isMobile}
          onMenuClick={toggleDrawer}
          search={search}
          onSearchChange={onSearchChange}
        />
        <Content className="app-shell__content">{children}</Content>
      </Layout>
    </Layout>
  );
};

export default AppShell;

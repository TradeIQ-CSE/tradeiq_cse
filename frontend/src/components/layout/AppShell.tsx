import React, { useState } from 'react';
import { Layout, Drawer, Grid } from 'antd';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const { Content } = Layout;

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const screens = Grid.useBreakpoint();
  // md is false when viewport < 768px (i.e. mobile sizes)
  const isMobile = screens.md === false;
  const [drawerVisible, setDrawerVisible] = useState(false);

  const toggleDrawer = () => {
    setDrawerVisible(!drawerVisible);
  };

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#0a0d14' }}>
      {/* Mobile Drawer menu */}
      {isMobile ? (
        <Drawer
          placement="left"
          onClose={toggleDrawer}
          open={drawerVisible}
          styles={{ body: { padding: 0, backgroundColor: '#0b0e13' } }}
          width={240}
          closable={false}
        >
          <Sidebar isMobile onClose={toggleDrawer} />
        </Drawer>
      ) : (
        /* Desktop Sider */
        <Layout.Sider
          width={240}
          theme="dark"
          style={{
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            backgroundColor: '#0b0e13',
            borderRight: '1px solid rgba(255, 255, 255, 0.04)',
            zIndex: 10,
          }}
          trigger={null}
          collapsible
        >
          <Sidebar />
        </Layout.Sider>
      )}

      {/* Main content viewport */}
      <Layout
        style={{
          marginLeft: isMobile ? 0 : 240,
          backgroundColor: '#0a0d14',
          minHeight: '100vh',
          transition: 'margin-left 0.2s',
        }}
      >
        <Topbar isMobile={isMobile} onMenuClick={toggleDrawer} />
        <Content
          style={{
            padding: '24px',
            marginTop: 64, // height of topbar header
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppShell;

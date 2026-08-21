import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Layout, Drawer, Grid } from "antd";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const { Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export function AppShell() {
  const screens = useBreakpoint();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // If screens.md is undefined (during server/first render), default to desktop (false)
  const isMobile = screens.md === false;

  // Auto-close mobile drawer when transitioning to desktop resolution
  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [isMobile]);

  const handleToggleDrawer = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleCloseDrawer = () => {
    setMobileDrawerOpen(false);
  };

  return (
    <Layout style={{ minHeight: "100vh", background: "#0a0d14" }}>
      {/* Desktop Sider: visible when screens.md is true (width >= 768px) */}
      {!isMobile && (
        <Sider
          width={240}
          breakpoint="md"
          collapsedWidth="0"
          trigger={null}
          style={{
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            borderRight: "1px solid #2a3343",
            zIndex: 101,
          }}
        >
          <Sidebar />
        </Sider>
      )}

      {/* Mobile Drawer Navigation: visible when screens.md is false (width < 768px) */}
      {isMobile && (
        <Drawer
          placement="left"
          onClose={handleCloseDrawer}
          open={mobileDrawerOpen}
          styles={{
            body: { padding: 0, height: "100%" },
          }}
          width={240}
          closable={false}
        >
          <Sidebar onCloseMobileDrawer={handleCloseDrawer} />
        </Drawer>
      )}

      {/* Main Content Layout */}
      <Layout
        style={{
          marginLeft: isMobile ? 0 : 240,
          minHeight: "100vh",
          background: "#0a0d14",
          transition: "margin-left 0.2s",
        }}
      >
        <Topbar onToggleMobileDrawer={handleToggleDrawer} isMobile={isMobile} />
        
        <Content
          style={{
            padding: "24px",
            background: "#0a0d14",
            minHeight: 280,
            overflowY: "auto",
          }}
        >
          {/* Outlet maps to current route's page component */}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

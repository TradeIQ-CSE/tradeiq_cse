import { useLocation } from "react-router-dom";
import { Layout, Button, Input, Breadcrumb, Space } from "antd";
import { MenuOutlined, ThunderboltOutlined, SearchOutlined } from "@ant-design/icons";

const { Header } = Layout;

interface TopbarProps {
  onToggleMobileDrawer: () => void;
  isMobile: boolean;
}

export function Topbar({ onToggleMobileDrawer, isMobile }: TopbarProps) {
  const location = useLocation();

  // Generate breadcrumb items based on current URL path
  const getBreadcrumbs = () => {
    const path = location.pathname;
    const cleanPath = path.replace("/", "");
    if (!cleanPath) return [{ title: "Dashboard" }];

    // Capitalize first letter
    const pageName = cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);
    
    if (pageName === "Admin") {
      return [{ title: "Admin Portal" }, { title: "Overview" }];
    }

    return [
      { title: "Home", href: "/dashboard" },
      { title: pageName },
    ];
  };

  const getPageTitle = () => {
    const path = location.pathname;
    const cleanPath = path.replace("/", "");
    if (!cleanPath) return "Dashboard";
    return cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);
  };

  return (
    <Header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#141922",
        borderBottom: "1px solid #2a3343",
        padding: "0 24px",
        height: 64,
        zIndex: 100,
      }}
    >
      <Space size="middle" style={{ flexGrow: 1, overflow: "hidden" }}>
        {/* Mobile Hamburger Menu Toggle */}
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined style={{ color: "#ffffff" }} />}
            onClick={onToggleMobileDrawer}
            style={{ fontSize: "16px", width: 40, height: 40 }}
          />
        )}

        {/* Breadcrumbs or Page Title */}
        {!isMobile && (
          <Breadcrumb
            items={getBreadcrumbs()}
            style={{ color: "#9aa4b2" }}
            separator={<span style={{ color: "#53647e" }}>/</span>}
          />
        )}
      </Space>

      {/* Search Bar & Actions */}
      <Space size="middle" style={{ flexShrink: 0 }}>
        <Input
          placeholder="Search symbol or company..."
          prefix={<SearchOutlined style={{ color: "#53647e" }} />}
          style={{
            width: isMobile ? 160 : 260,
            background: "#0f1218",
            border: "1px solid #2a3343",
            borderRadius: 6,
            color: "#e6e9f0",
          }}
        />

        {/* AI Assistant Call to Action */}
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          style={{
            background: "linear-gradient(135deg, #722ed1, #873bf4)",
            border: "none",
            borderRadius: 6,
            fontWeight: "500",
            boxShadow: "0 2px 8px rgba(114, 46, 209, 0.4)",
          }}
        >
          {!isMobile && "AI Assistant"}
        </Button>
      </Space>
    </Header>
  );
}

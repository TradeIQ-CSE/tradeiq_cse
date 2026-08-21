import { useLocation, useNavigate } from "react-router-dom";
import { Menu, Avatar, Dropdown, Segmented, Typography } from "antd";
import {
  StockOutlined,
  StarOutlined,
  PieChartOutlined,
  ShoppingOutlined,
  ShoppingCartOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useState } from "react";

const { Text } = Typography;

interface SidebarProps {
  onCloseMobileDrawer?: () => void;
}

export function Sidebar({ onCloseMobileDrawer }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [lang, setLang] = useState<string>("EN");

  // Highlight menu item depending on the current path
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith("/markets")) return "markets";
    if (path.startsWith("/watchlist")) return "watchlist";
    if (path.startsWith("/portfolio")) return "portfolio";
    if (path.startsWith("/orders")) return "orders";
    if (path.startsWith("/paper-trading")) return "paper-trading";
    if (path.startsWith("/analytics")) return "analytics";
    if (path.startsWith("/ai-insights")) return "ai-insights";
    if (path.startsWith("/reports")) return "reports";
    return "markets"; // Default to markets to match Figma's selected view
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(`/${key}`);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  // Grouped Menu structure matching Figma exactly
  const menuItems = [
    {
      type: "group",
      label: "MARKETS",
      children: [
        {
          key: "markets",
          icon: <StockOutlined />,
          label: "Markets",
        },
        {
          key: "watchlist",
          icon: <StarOutlined />,
          label: "Watchlist",
        },
      ],
    },
    {
      type: "group",
      label: "MY PORTFOLIO",
      children: [
        {
          key: "portfolio",
          icon: <PieChartOutlined />,
          label: "Portfolio",
        },
        {
          key: "orders",
          icon: <ShoppingOutlined />,
          label: "Trades",
        },
      ],
    },
    {
      type: "group",
      label: "TRADING",
      children: [
        {
          key: "paper-trading",
          icon: <ShoppingCartOutlined />,
          label: "Paper Trading",
        },
      ],
    },
    {
      type: "group",
      label: "ANALYSIS",
      children: [
        {
          key: "analytics",
          icon: <LineChartOutlined />,
          label: "Backtesting",
        },
        {
          key: "ai-insights",
          icon: <ThunderboltOutlined />,
          label: "AI Insights",
        },
      ],
    },
    {
      type: "group",
      label: "UTILITIES",
      children: [
        {
          key: "reports",
          icon: <FileTextOutlined />,
          label: "Reports",
        },
      ],
    },
  ];

  const profileMenuItems = {
    items: [
      {
        key: "profile",
        icon: <UserOutlined />,
        label: "Profile Settings",
      },
      {
        key: "settings",
        icon: <SettingOutlined />,
        label: "App Settings",
      },
      {
        type: "divider" as const,
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Sign Out",
        danger: true,
      },
    ],
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "16px 8px",
        background: "#0b0e13",
      }}
    >
      <div style={{ overflowY: "auto", flexGrow: 1, paddingBottom: 16 }} className="custom-sidebar-scroll">
        {/* Logo / Header Branding */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #722ed1, #a855f7)",
              marginRight: 10,
              flexShrink: 0,
            }}
          />
          <Text
            strong
            style={{
              fontSize: 18,
              color: "#ffffff",
              letterSpacing: "0.5px",
            }}
          >
            TradeIQ CSE
          </Text>
        </div>

        {/* Navigation Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          onClick={handleMenuClick}
          items={menuItems}
          style={{ borderRight: 0, background: "transparent" }}
        />
      </div>

      {/* Bottom Profile and Utilities */}
      <div style={{ padding: "0 8px 8px 8px", flexShrink: 0 }}>
        {/* Language Selection */}
        <div style={{ marginBottom: 20, padding: "0 8px" }}>
          <div
            style={{
              fontSize: 11,
              color: "#53647e",
              fontWeight: "bold",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 8,
            }}
          >
            Language
          </div>
          <Segmented
            value={lang}
            onChange={(value) => setLang(value as string)}
            options={["EN", "සිංහල", "தமிழ்"]}
            block
            style={{
              background: "#141922",
              color: "#9aa4b2",
              fontSize: 12,
            }}
          />
        </div>

        <div style={{ height: "1px", background: "#1c2434", marginBottom: 16 }} />

        {/* Profile Dropdown */}
        <Dropdown menu={profileMenuItems} trigger={["click"]} placement="topRight">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px",
              borderRadius: 8,
              cursor: "pointer",
              background: "#141922",
              transition: "background 0.2s",
              border: "1px solid #1c2434",
            }}
            className="sidebar-profile-card"
          >
            <Avatar
              size={36}
              style={{
                backgroundColor: "#722ed1",
                color: "#fff",
                marginRight: 10,
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              N
            </Avatar>
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, overflow: "hidden" }}>
              <Text strong style={{ color: "#ffffff", fontSize: 13, lineHeight: "1.2" }}>
                Nimesh
              </Text>
              <Text style={{ color: "#53647e", fontSize: 11 }}>
                Live trader
              </Text>
            </div>
            <ArrowRightOutlined style={{ color: "#53647e", fontSize: 12 }} />
          </div>
        </Dropdown>
      </div>
    </div>
  );
}

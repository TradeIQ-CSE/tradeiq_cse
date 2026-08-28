import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, Avatar, Dropdown, Space, Typography, Segmented } from 'antd';
import {
  DashboardOutlined,
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
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';

const { Text } = Typography;

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobile, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/markets')) return 'markets';
    if (path.startsWith('/watchlist')) return 'watchlist';
    if (path.startsWith('/portfolio')) return 'portfolio';
    if (path.startsWith('/orders')) return 'orders';
    if (path.startsWith('/paper-trading')) return 'paper-trading';
    if (path.startsWith('/analytics')) return 'analytics';
    if (path.startsWith('/ai-insights')) return 'ai-insights';
    if (path.startsWith('/admin')) return 'admin';
    return 'markets';
  };

  const handleMenuClick = (info: { key: string }) => {
    navigate(`/${info.key}`);
    if (isMobile && onClose) {
      onClose();
    }
  };

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
  };

  const profileMenuItems = [
    {
      key: 'settings',
      label: t('nav.items.settings') || 'Settings',
      icon: <SettingOutlined />,
      onClick: () => navigate('/settings'),
    },
    {
      key: 'logout',
      label: 'Logout',
      icon: <LogoutOutlined />,
      onClick: () => console.log('Logout clicked'),
    },
  ];

  // Grouped Menu structure matching Figma sections
  const menuItems = [
    {
      type: 'group' as const,
      label: <span style={{ color: '#45556c', fontSize: '10px', fontWeight: 600, letterSpacing: '1px' }}>MARKETS</span>,
      children: [
        {
          key: 'dashboard',
          icon: <DashboardOutlined style={{ fontSize: '16px' }} />,
          label: t('dashboard') || 'Dashboard',
        },
        {
          key: 'markets',
          icon: <StockOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.markets') || 'Markets',
        },
        {
          key: 'watchlist',
          icon: <StarOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.watchlist') || 'Watchlist',
        },
      ],
    },
    {
      type: 'group' as const,
      label: <span style={{ color: '#45556c', fontSize: '10px', fontWeight: 600, letterSpacing: '1px' }}>MY PORTFOLIO</span>,
      children: [
        {
          key: 'portfolio',
          icon: <PieChartOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.portfolio') || 'Portfolio',
        },
        {
          key: 'orders',
          icon: <ShoppingOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.trades') || 'Orders',
        },
      ],
    },
    {
      type: 'group' as const,
      label: <span style={{ color: '#45556c', fontSize: '10px', fontWeight: 600, letterSpacing: '1px' }}>TRADING</span>,
      children: [
        {
          key: 'paper-trading',
          icon: <ShoppingCartOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.paperTrading') || 'Paper Trading',
        },
      ],
    },
    {
      type: 'group' as const,
      label: <span style={{ color: '#45556c', fontSize: '10px', fontWeight: 600, letterSpacing: '1px' }}>ANALYSIS</span>,
      children: [
        {
          key: 'analytics',
          icon: <LineChartOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.backtesting') || 'Analytics',
        },
        {
          key: 'ai-insights',
          icon: <ThunderboltOutlined style={{ fontSize: '16px' }} />,
          label: t('nav.items.aiInsights') || 'AI Assistant',
        },
      ],
    },
    {
      type: 'group' as const,
      label: <span style={{ color: '#45556c', fontSize: '10px', fontWeight: 600, letterSpacing: '1px' }}>UTILITIES</span>,
      children: [
        {
          key: 'admin',
          icon: <FileTextOutlined style={{ fontSize: '16px' }} />,
          label: 'Admin Panel',
        },
      ],
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0b0e13',
        borderRight: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* Brand Logo Header */}
      <div
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: '#722ed1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '16px',
            boxShadow: '0 2px 8px rgba(114, 46, 209, 0.4)',
          }}
        >
          T
        </div>
        <Text style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '16px', letterSpacing: '0.5px' }}>
          {t('app.name') || 'TradeIQ CSE'}
        </Text>
      </div>

      {/* Navigation Menu */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px 24px 8px' }}>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
          }}
        />
      </div>

      {/* Footer Area */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          backgroundColor: '#070a0e',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Language selector toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: '#45556c', fontWeight: 600 }}>
            {t('nav.language') || 'LANGUAGE'}
          </span>
          <Segmented
            options={SUPPORTED_LANGUAGES.map((lang) => ({
              label: lang.label,
              value: lang.code,
              disabled: !lang.available && lang.code !== i18n.resolvedLanguage,
            }))}
            value={i18n.resolvedLanguage || 'en'}
            onChange={(value) => handleLanguageChange(value as string)}
            style={{
              backgroundColor: '#0b0e13',
              color: '#90a1b9',
              fontSize: '11px',
              padding: '2px',
            }}
          />
        </div>

        {/* User profile dropdown card */}
        <Dropdown menu={{ items: profileMenuItems }} trigger={['click']} placement="topRight">
          <button
            type="button"
            aria-label="Open profile menu"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: '#0b0e13',
              cursor: 'pointer',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              transition: 'background-color 0.2s',
              width: '100%',
              textAlign: 'left',
              fontFamily: 'inherit',
              color: 'inherit',
            }}
            className="sidebar-profile-card"
          >
            <Space size={10}>
              <Avatar
                size="small"
                style={{ backgroundColor: '#722ed1', verticalAlign: 'middle' }}
                icon={<UserOutlined />}
              >
                N
              </Avatar>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 600 }}>Nimesh</span>
                <span style={{ color: '#64748b', fontSize: '10px' }}>{t('nav.profile.role') || 'Live trader'}</span>
              </div>
            </Space>
            <span style={{ color: '#45556c', fontSize: '10px' }}>▼</span>
          </button>
        </Dropdown>
      </div>
    </div>
  );
};

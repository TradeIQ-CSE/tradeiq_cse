import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Button, Input, Breadcrumb, Space } from 'antd';
import { MenuOutlined, ThunderboltOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Header } = Layout;

interface TopbarProps {
  isMobile: boolean;
  onMenuClick: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ isMobile, onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return t('dashboard') || 'Dashboard';
    if (path.startsWith('/markets')) return t('nav.items.markets') || 'Markets';
    if (path.startsWith('/watchlist')) return t('nav.items.watchlist') || 'Watchlist';
    if (path.startsWith('/portfolio')) return t('nav.items.portfolio') || 'Portfolio';
    if (path.startsWith('/orders')) return t('nav.items.trades') || 'Orders';
    if (path.startsWith('/paper-trading')) return t('nav.items.paperTrading') || 'Paper Trading';
    if (path.startsWith('/analytics')) return t('nav.items.backtesting') || 'Analytics';
    if (path.startsWith('/ai-insights')) return t('nav.items.aiInsights') || 'AI Assistant';
    if (path.startsWith('/admin')) return 'Admin Panel';
    return 'Dashboard';
  };

  // Simple breadcrumb generator based on pathname
  const pathSnippets = location.pathname.split('/').filter((i) => i);
  const breadcrumbItems = [
    {
      title: <Link to="/dashboard" style={{ color: 'inherit' }}>Home</Link>,
      className: 'breadcrumb-home',
    },
    ...pathSnippets.map((snippet) => {
      const translationKey = snippet === 'dashboard' ? 'dashboard' : `nav.items.${snippet}`;
      const translated = t(translationKey);
      const titleFallback = snippet.charAt(0).toUpperCase() + snippet.slice(1);
      return {
        title: translated === translationKey ? titleFallback : translated,
      };
    }),
  ];

  return (
    <Header
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: isMobile ? 0 : 240,
        height: '64px',
        padding: '0 24px',
        backgroundColor: '#0a0d14',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 5,
        transition: 'left 0.2s',
      }}
    >
      <Space size={16} align="center">
        {isMobile && (
          <>
            <Button
              type="text"
              icon={<MenuOutlined style={{ color: '#e2e8f0', fontSize: '18px' }} />}
              onClick={onMenuClick}
              style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            />
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '15px' }}>
              {getPageTitle()}
            </span>
          </>
        )}
        
        {!isMobile && (
          <Breadcrumb 
            items={breadcrumbItems} 
            style={{ 
              color: '#64748b', 
              fontSize: '12px',
              fontWeight: 500,
            }}
          />
        )}
      </Space>

      <Space size={16} align="center">
        {/* Search Input Box */}
        <Input
          prefix={<SearchOutlined style={{ color: '#64748b', marginRight: '4px' }} />}
          placeholder={t('topbar.searchPlaceholder') || 'Search symbol or company…'}
          variant="borderless"
          style={{
            width: isMobile ? '160px' : '280px',
            backgroundColor: '#0b0e13',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            borderRadius: '20px',
            color: '#e2e8f0',
            padding: '4px 16px',
            fontSize: '12px',
            transition: 'width 0.2s, border-color 0.2s',
          }}
          className="topbar-search-input"
        />

        {/* AI Assistant Button */}
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          style={{
            backgroundColor: '#722ed1',
            borderColor: '#722ed1',
            borderRadius: '20px',
            fontWeight: 600,
            fontSize: '12px',
            boxShadow: '0 2px 8px rgba(114, 46, 209, 0.3)',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
          }}
          onClick={() => navigate('/ai-insights')}
        >
          {!isMobile && 'AI Assistant'}
        </Button>
      </Space>
    </Header>
  );
};

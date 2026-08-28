import { ThemeConfig, theme } from 'antd';

export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#722ed1',
    colorInfo: '#722ed1',
    colorBgBase: '#0a0d14',
    colorBgContainer: '#0a0d14',
    colorBgElevated: '#12131f',
    colorBorder: 'rgba(255, 255, 255, 0.08)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.04)',
    colorTextBase: '#e2e8f0',
    colorTextSecondary: '#90a1b9',
    borderRadius: 8,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Layout: {
      colorBgHeader: '#0a0d14',
      colorBgBody: '#0a0d14',
      colorBgTrigger: '#0b0e13',
    },
    Menu: {
      colorItemBg: 'transparent',
      colorItemBgSelected: 'rgba(114, 46, 209, 0.15)',
      colorItemTextSelected: '#a78bfa',
      colorItemTextHover: '#e2e8f0',
      colorItemBgHover: 'rgba(255, 255, 255, 0.02)',
      colorActiveBarWidth: 3,
      fontSize: 13,
    },
    Table: {
      colorBgContainer: 'transparent',
      colorHeaderBg: 'transparent',
      colorHeaderColor: '#90a1b9',
      colorBorder: 'rgba(255, 255, 255, 0.04)',
      fontSize: 13,
      padding: 12,
    },
    Segmented: {
      colorBgContainer: '#0b0e13',
      colorBgLayout: '#0b0e13',
      colorItemBgSelected: '#722ed1',
      colorItemTextSelected: '#ffffff',
    },
    Drawer: {
      colorBgContainer: '#0b0e13',
    },
  },
};

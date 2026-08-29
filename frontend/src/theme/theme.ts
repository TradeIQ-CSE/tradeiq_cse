import { ThemeConfig, theme } from 'antd';

export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#7c3aed',
    colorInfo: '#7c3aed',
    colorBgBase: '#0b0c19',
    colorBgContainer: '#0d0e1d',
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
      headerBg: '#0b0c19',
      bodyBg: '#0b0c19',
      triggerBg: '#0d0e1d',
    },
    Menu: {
      colorItemBg: 'transparent',
      colorItemBgSelected: 'rgba(124, 58, 237, 0.15)',
      colorItemTextSelected: '#a78bfa',
      colorItemTextHover: '#e2e8f0',
      colorItemBgHover: 'rgba(255, 255, 255, 0.02)',
      colorActiveBarWidth: 3,
      fontSize: 13,
    },
    Table: {
      colorBgContainer: 'transparent',
      headerBg: 'transparent',
      headerColor: '#90a1b9',
      borderColor: 'rgba(255, 255, 255, 0.04)',
      cellFontSize: 13,
      cellPaddingBlock: 12,
      cellPaddingInline: 12,
    },
    Segmented: {
      trackBg: '#0d0e1d',
      itemSelectedBg: '#7c3aed',
      itemSelectedColor: '#ffffff',
    },
    Drawer: {
      colorBgContainer: '#0d0e1d',
    },
  },
};

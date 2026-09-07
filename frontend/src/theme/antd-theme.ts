import { ThemeConfig, theme } from 'antd';
import { ColorTokens, darkTokens, lightTokens } from './tokens';

// Ant Design still renders every screen this branch hasn't migrated to
// BoardUI yet (see docs/plans/frontend-boardui-refresh.md, Phase 1: "Keep
// Ant Design temporarily on screens that have not been migrated"). This
// builds its theme from the same tokens BoardUI's CSS uses, rather than a
// second hand-picked palette, so both systems move together.
function buildAntdTheme(tokens: ColorTokens, mode: 'light' | 'dark'): ThemeConfig {
  const hoverBg = mode === 'dark' ? 'rgba(59, 130, 246, 0.16)' : 'rgba(37, 99, 235, 0.08)';
  const selectedBg = mode === 'dark' ? 'rgba(59, 130, 246, 0.22)' : 'rgba(37, 99, 235, 0.12)';
  const borderSecondary = mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)';

  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: tokens.brand,
      colorInfo: tokens.brand,
      colorSuccess: tokens.positive,
      colorError: tokens.negative,
      colorWarning: tokens.warning,
      colorBgBase: tokens.bgApp,
      colorBgContainer: tokens.surfacePrimary,
      colorBgElevated: tokens.surfaceElevated,
      colorBorder: tokens.border,
      colorBorderSecondary: borderSecondary,
      colorTextBase: tokens.textPrimary,
      colorTextSecondary: tokens.textSecondary,
      borderRadius: 8,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: {
      Layout: {
        headerBg: tokens.bgApp,
        bodyBg: tokens.bgApp,
        triggerBg: tokens.surfacePrimary,
      },
      Menu: {
        colorItemBg: 'transparent',
        colorItemBgSelected: selectedBg,
        colorItemTextSelected: tokens.brand,
        colorItemTextHover: tokens.textPrimary,
        colorItemBgHover: hoverBg,
        colorActiveBarWidth: 3,
        fontSize: 13,
      },
      Table: {
        colorBgContainer: 'transparent',
        headerBg: 'transparent',
        headerColor: tokens.textSecondary,
        borderColor: borderSecondary,
        cellFontSize: 13,
        cellPaddingBlock: 12,
        cellPaddingInline: 12,
      },
      Segmented: {
        trackBg: tokens.surfaceElevated,
        itemSelectedBg: tokens.brand,
        itemSelectedColor: '#ffffff',
      },
      Drawer: {
        colorBgContainer: tokens.surfacePrimary,
      },
    },
  };
}

export const lightAntdTheme: ThemeConfig = buildAntdTheme(lightTokens, 'light');
export const darkAntdTheme: ThemeConfig = buildAntdTheme(darkTokens, 'dark');

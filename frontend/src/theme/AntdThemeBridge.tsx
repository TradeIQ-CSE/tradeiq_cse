import { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { useTheme } from './useTheme';
import { darkAntdTheme, lightAntdTheme } from './antd-theme';

// Ant Design's theme.token can't read our CSS custom properties, so it's
// driven from the same resolved light/dark state as everything else instead
// — see antd-theme.ts for why these configs are generated from tokens.ts.
export function AntdThemeBridge({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? darkAntdTheme : lightAntdTheme;
  return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
}

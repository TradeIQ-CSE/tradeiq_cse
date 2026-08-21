import type { ThemeConfig } from "antd";
import { theme } from "antd";

export const tradeIQTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#722ed1",
    colorInfo: "#722ed1",
    colorBgBase: "#0a0d14",
    colorBgContainer: "#141922",
    colorBgElevated: "#1b2230",
    colorBgLayout: "#0a0d14",
    colorTextBase: "#e6e9f0",
    colorBorder: "#2a3343",
    colorBorderSecondary: "#232c3b",
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Layout: {
      siderBg: "#0b0e13",
      headerBg: "#141922",
      headerHeight: 56,
      headerPadding: "0 24px",
      bodyBg: "#0a0d14",
    },
    Menu: {
      darkItemBg: "#0b0e13",
      darkItemSelectedBg: "#722ed1",
      darkItemSelectedColor: "#ffffff",
      darkItemColor: "#9aa4b2",
      darkItemHoverColor: "#e6e9f0",
      darkSubMenuItemBg: "#0b0e13",
      itemBorderRadius: 8,
      groupTitleColor: "#53647e",
    },
    Card: {
      colorBgContainer: "#141922",
      headerBg: "transparent",
    },
    Table: {
      colorBgContainer: "transparent",
      headerBg: "transparent",
      headerColor: "#53647e",
      headerSplitColor: "transparent",
      borderColor: "#1c2434",
    },
  },
};

/**
 * Canonical color tokens for TradeIQ CSE — the single source both the
 * Ant Design theme adapter (antd-theme.ts) and BoardUI's Tailwind tokens
 * (styles/theme.css) are meant to agree with.
 *
 * Values match the candidate palette in docs/plans/frontend-boardui-refresh.md
 * (itself Tailwind's slate/blue/green/red/amber scale) and BoardUI's default
 * accent, which already resolves to the same blue. Candidates pending a
 * contrast pass before being called final — see that doc's "Color rules".
 */

export interface ColorTokens {
  bgApp: string;
  surfacePrimary: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  brand: string;
  brandHover: string;
  focusRing: string;
  positive: string;
  negative: string;
  warning: string;
}

export const lightTokens: ColorTokens = {
  bgApp: "#F8FAFC",
  surfacePrimary: "#FFFFFF",
  surfaceElevated: "#F1F5F9",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  border: "#E2E8F0",
  brand: "#2563EB",
  brandHover: "#1D4ED8",
  focusRing: "#2563EB",
  positive: "#15803D",
  negative: "#DC2626",
  warning: "#B45309",
};

export const darkTokens: ColorTokens = {
  bgApp: "#0B1120",
  surfacePrimary: "#111827",
  surfaceElevated: "#172033",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  border: "#263244",
  brand: "#3B82F6",
  brandHover: "#60A5FA",
  focusRing: "#60A5FA",
  positive: "#4ADE80",
  negative: "#F87171",
  warning: "#FBBF24",
};

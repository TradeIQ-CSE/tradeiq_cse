/**
 * The candlestick chart's colours, expressed as BoardUI's own chart tokens.
 *
 * These are `var(--color-chart-*)` references rather than resolved hex
 * strings, exactly as BoardUI's shipped chart cards feed them to Recharts:
 * SVG presentation attributes participate in the CSS cascade, so a custom
 * property resolves there and follows the light/dark swap for free. Nothing
 * here needs to know which theme is active.
 *
 * Up/down keep the semantic status tokens rather than a chart series colour —
 * on a price chart green and red carry meaning, and must stay the same green
 * and red the tables and chips use.
 */

export interface ChartPalette {
  /** Close-price line used when the source cannot form real candle bodies. */
  price: string;
  /** Close above open. */
  up: string;
  /** Close below open. */
  down: string;
  /** Unchanged, or an unknown open. */
  neutral: string;
  /** Horizontal grid rules behind the series. */
  grid: string;
  /** Axis lines and tick marks. */
  axis: string;
  /** Axis tick labels. */
  tick: string;
  /** Hover band behind the active candle. */
  cursor: string;
}

export const chartPalette: ChartPalette = {
  price: "var(--color-accent-500)",
  up: "var(--color-status-lime-text)",
  down: "var(--color-status-rose-text)",
  // Not --color-chart-neutral: that is slate-800 in dark, invisible against
  // the card. This colour draws the candle wicks, so it has to read on both.
  neutral: "var(--color-text-secondary)",
  // Not --color-chart-track: in dark that is slate-800, the same value as the
  // card it is drawn on, so the rules disappear. border/button/default is the
  // one edge token with contrast against both surfaces.
  grid: "var(--color-border-button-default)",
  axis: "var(--color-border-button-default)",
  tick: "var(--color-text-tertiary)",
  cursor: "var(--color-background-secondary-hover)",
};

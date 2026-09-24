/**
 * The candlestick chart's colours, expressed as BoardUI's own chart tokens.
 *
 * These are `var(--color-chart-*)` references rather than resolved hex
 * strings, exactly as BoardUI's shipped chart cards feed them to Recharts:
 * SVG presentation attributes participate in the CSS cascade, so a custom
 * property resolves there and follows the light/dark swap for free. Nothing
 * here needs to know which theme is active.
 *
 * Up/down are the site's one green and red (--color-gain/--color-loss in
 * theme.css) at their fill shade; chips and price text use the same hue at
 * the -text shade, which is tuned for small type.
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
  /**
   * Fill for the grey band a data gap draws across the price and volume
   * panels. One token for both `missing_data` and `market_closed`: the two
   * kinds share the same mechanism (docs/plans/data-gap-handling.md §4) and
   * are told apart by a lighter fill opacity on `market_closed` rather than
   * a second colour — see GapBands in components/charts/gap-band.tsx.
   */
  gap: string;
}

export const chartPalette: ChartPalette = {
  price: "var(--color-accent-500)",
  up: "var(--color-chart-up)",
  down: "var(--color-chart-down)",
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
  gap: "var(--color-chart-gap)",
};

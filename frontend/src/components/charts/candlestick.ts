// Pure candle geometry, kept out of CandlestickChart.tsx so it stays a
// component-only module: exporting helpers alongside the component breaks
// fast refresh, and this logic needs no React to be tested.

import { chartPalette } from './chart-theme';

export interface CandleDatum {
  open: number | null;
  high: number;
  low: number;
  close: number;
  /**
   * Used only to choose an up/down colour when the source has no opening
   * price. Geometry and displayed OHLC values must continue to use `open`.
   */
  comparisonClose?: number | null;
}

export interface ChartDatum extends CandleDatum {
  date: string;
  periodEnd?: string | null;
  adjustedClose?: number | null;
  volume: number;
}

/**
 * Add a close-to-close comparison without rewriting a missing opening price.
 * This keeps the API truth available to labels and assistive technology while
 * giving charts a standard directional colour when OHLC is incomplete.
 */
export function withCandleComparisons(
  data: readonly ChartDatum[],
): ChartDatum[] {
  return data.map((point, index) => ({
    ...point,
    comparisonClose: data[index - 1]?.close ?? null,
  }));
}

/**
 * Missing opens remain missing in labels and tooltips. Close is used only as
 * neutral chart geometry so Recharts can still place a wick for that bar.
 */
export function candleGeometryOpen(point: CandleDatum): number {
  return point.open ?? point.close;
}

/** The filled body of a candle, spanning open to close in either direction. */
export function candleBody(point: CandleDatum): [number, number] {
  const open = candleGeometryOpen(point);
  return [Math.min(open, point.close), Math.max(open, point.close)];
}

/** Lower and upper wick lengths, measured out from the body. */
export function candleWick(point: CandleDatum): [number, number] {
  const bodyHigh = Math.max(candleGeometryOpen(point), point.close);
  return [bodyHigh - point.low, point.high - bodyHigh];
}

/**
 * The candle's colour, chosen from a theme-resolved palette rather than fixed
 * hexes — the chart has to read on both a light and a dark ground.
 */
export function candleColor(point: CandleDatum): string {
  const reference = point.open ?? point.comparisonClose;
  if (reference === null || reference === undefined) {
    return chartPalette.neutral;
  }
  if (point.close > reference) return chartPalette.up;
  if (point.close < reference) return chartPalette.down;
  return chartPalette.neutral;
}

function asUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function chartDateLabel(point: ChartDatum, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const start = formatter.format(asUtcDate(point.date));
  // A weekly or monthly bar can cover a single traded day, because the API
  // clamps periods to the requested range and a holiday-shortened week leaves
  // one session. Repeating the same date either side of a dash reads as a bug.
  return point.periodEnd && point.periodEnd !== point.date
    ? `${start} – ${formatter.format(asUtcDate(point.periodEnd))}`
    : start;
}

export function chartTickLabel(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(asUtcDate(day));
}

/**
 * A price chart must not shrink candles to fit: past a certain width they read
 * as hairlines and the shape of a session is lost. Instead a fixed candle width
 * is kept and a window of the series is shown, which is how trading charts
 * normally behave. These helpers hold that window's arithmetic; the component
 * owns the gestures that move it.
 */

/** Narrowest a candle may become, including the gap to its neighbour. */
export const MIN_BAR_WIDTH = 8;
/**
 * Widest, so a two-bar range renders as candles rather than slabs. Set so the
 * default 15 bars still fill a panel up to about 1080px; past that the chart
 * shows more than 15 rather than drawing absurdly fat candles.
 */
export const MAX_BAR_WIDTH = 72;
/** What a chart opens on, per the mentor's "maximally show 15 in the screen". */
export const DEFAULT_VISIBLE_BARS = 15;

/** Bar width that fits `count` bars in `plotWidth`, within the allowed range. */
export function barWidthFor(plotWidth: number, count: number): number {
  if (count <= 0 || plotWidth <= 0) return MAX_BAR_WIDTH;
  const exact = plotWidth / count;
  return Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, exact));
}

/**
 * How many bars fit at `barWidth`, never more than the series holds and never
 * fewer than one. The floor on bar width caps this, which is what stops a zoom
 * out from compressing the series.
 */
export function visibleCountFor(
  plotWidth: number,
  barWidth: number,
  total: number,
): number {
  if (total <= 0) return 0;
  if (plotWidth <= 0) return Math.min(total, DEFAULT_VISIBLE_BARS);
  // The epsilon keeps an exact fit from losing its last bar: plotWidth divided
  // by a width derived from that same width can land a hair under the integer.
  const fits = Math.floor(plotWidth / Math.max(barWidth, MIN_BAR_WIDTH) + 1e-9);
  return Math.min(total, Math.max(1, fits));
}

/** Keep a window start inside the series, so panning stops at either end. */
export function clampStartIndex(
  start: number,
  visibleCount: number,
  total: number,
): number {
  const last = Math.max(0, total - visibleCount);
  if (!Number.isFinite(start)) return last;
  return Math.min(last, Math.max(0, Math.round(start)));
}

/**
 * Opening window: the most recent bars, because the latest session is what a
 * reader looks for first. A series shorter than the window shows whole.
 */
export function defaultStartIndex(visibleCount: number, total: number): number {
  return Math.max(0, total - visibleCount);
}

/** Price bounds for the bars on screen, padded, so the window fills the panel. */
export function windowDomain(
  bars: ChartDatum[],
  mode: 'candlestick' | 'close',
): [number, number] {
  const prices =
    mode === 'close'
      ? bars.map((bar) => bar.close)
      : bars.flatMap((bar) => [bar.low, bar.high]);
  if (prices.length === 0) return [0, 1];
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const padding = Math.max((highest - lowest) * 0.05, 1);
  return [lowest - padding, highest + padding];
}

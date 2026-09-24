// Pure candle geometry, kept out of CandlestickChart.tsx so it stays a
// component-only module: exporting helpers alongside the component breaks
// fast refresh, and this logic needs no React to be tested.

import { chartPalette } from './chart-theme';
import { DataGap } from '../../lib/data-gaps';

export interface CandleDatum {
  open: number | null;
  /**
   * `null` only for a gap slot (docs/plans/data-gap-handling.md §4): a
   * placeholder bar with no real session behind it. A real bar's high/low/
   * close always come from the API, which never omits them.
   */
  high: number | null;
  low: number | null;
  close: number | null;
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
  volume: number | null;
  /** Present only for a gap slot — see `withGapSlots` (lib/data-gaps.ts). */
  gap?: DataGap;
}

/** A gap slot has no real prices; everything else is a genuine trading bar. */
export function isRealBar(point: ChartDatum): boolean {
  return point.gap === undefined;
}

/**
 * Add a close-to-close comparison without rewriting a missing opening price.
 * This keeps the API truth available to labels and assistive technology while
 * giving charts a standard directional colour when OHLC is incomplete.
 *
 * Walks forward tracking the last *real* close rather than simply reading
 * `data[index - 1]`, so a gap slot's null close is skipped: the first real
 * bar after a gap compares against the last real close before it, not
 * against the placeholder bar directly in front of it.
 */
export function withCandleComparisons(
  data: readonly ChartDatum[],
): ChartDatum[] {
  let lastRealClose: number | null = null;
  return data.map((point) => {
    const comparisonClose = lastRealClose;
    if (point.close !== null) lastRealClose = point.close;
    return { ...point, comparisonClose };
  });
}

/**
 * Missing opens remain missing in labels and tooltips. Close is used only as
 * neutral chart geometry so Recharts can still place a wick for that bar.
 * Null for a gap slot, which has no close to fall back to either.
 */
export function candleGeometryOpen(point: CandleDatum): number | null {
  return point.open ?? point.close;
}

/**
 * The filled body of a candle, spanning open to close in either direction.
 * `null` for a gap slot: returning null (rather than a zero-width range)
 * tells Recharts' function-accessor Bar there is nothing to draw for that
 * bar, the same way a null `close` breaks a Line.
 */
export function candleBody(point: CandleDatum): [number, number] | null {
  const open = candleGeometryOpen(point);
  if (open === null || point.close === null) return null;
  return [Math.min(open, point.close), Math.max(open, point.close)];
}

/** Lower and upper wick lengths, measured out from the body. `null` for a
 * gap slot, for the same reason as `candleBody`. */
export function candleWick(point: CandleDatum): [number, number] | null {
  const open = candleGeometryOpen(point);
  if (open === null || point.close === null || point.low === null || point.high === null) {
    return null;
  }
  const bodyHigh = Math.max(open, point.close);
  return [bodyHigh - point.low, point.high - bodyHigh];
}

/**
 * The candle's colour, chosen from a theme-resolved palette rather than fixed
 * hexes — the chart has to read on both a light and a dark ground. Neutral
 * for a gap slot too, though that colour is never actually seen: the slot's
 * body and wick are both null, so Recharts draws nothing for it.
 */
export function candleColor(point: CandleDatum): string {
  if (point.close === null) return chartPalette.neutral;
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

/**
 * Price bounds for the bars on screen, padded, so the window fills the
 * panel. Gap slots are ignored — they carry no price — so a domain computed
 * from an all-slot selection would otherwise fall through to the [0, 1]
 * fallback below; callers use `domainBars` to avoid that case entirely.
 */
export function windowDomain(
  bars: readonly ChartDatum[],
  mode: 'candlestick' | 'close',
): [number, number] {
  const real = bars.filter(isRealBar);
  const prices =
    mode === 'close'
      ? real.map((bar) => bar.close as number)
      : real.flatMap((bar) => [bar.low as number, bar.high as number]);
  if (prices.length === 0) return [0, 1];
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const padding = Math.max((highest - lowest) * 0.05, 1);
  return [lowest - padding, highest + padding];
}

/**
 * The bars `windowDomain` should price the axis from: the visible window's
 * own real bars, or — when the whole window landed on a gap — the nearest
 * real bar just outside it on each side, so the axis never collapses to
 * `windowDomain`'s [0, 1] fallback (docs/plans/data-gap-handling.md §4).
 */
export function domainBars(
  all: readonly ChartDatum[],
  startIndex: number,
  visibleCount: number,
): ChartDatum[] {
  const visible = all.slice(startIndex, startIndex + visibleCount);
  const real = visible.filter(isRealBar);
  if (real.length > 0) return real;

  const before = [...all.slice(0, startIndex)].reverse().find(isRealBar);
  const after = all.slice(startIndex + visibleCount).find(isRealBar);
  return [before, after].filter((bar): bar is ChartDatum => bar !== undefined);
}

/**
 * Volume bounds for `domainBars`' bars, mirroring what Recharts' own
 * `[0, 'auto']` default already computes for a window with a real bar in
 * it: volume bars always start at 0, and the top is the highest volume on
 * screen. Passed explicitly (with `allowDataOverflow`) only so an all-slot
 * window still has a domain to draw its axis and gap band from — a gap
 * slot's volume is always null, so Recharts' own auto-domain has nothing to
 * compute it from without `domainBars`' nearest-real-bar fallback.
 */
export function volumeDomain(bars: readonly ChartDatum[]): [number, number] {
  const volumes = bars.filter(isRealBar).map((bar) => bar.volume as number);
  if (volumes.length === 0) return [0, 1];
  return [0, Math.max(...volumes)];
}

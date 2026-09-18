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

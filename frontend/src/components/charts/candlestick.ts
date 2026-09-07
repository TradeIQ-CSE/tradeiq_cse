// Pure candle geometry, kept out of CandlestickChart.tsx so it stays a
// component-only module: exporting helpers alongside the component breaks
// fast refresh, and this logic needs no React to be tested.

export interface CandleDatum {
  open: number | null;
  high: number;
  low: number;
  close: number;
}

export interface ChartDatum extends CandleDatum {
  date: string;
  periodEnd?: string | null;
  adjustedClose?: number | null;
  volume: number;
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

export function candleColor(point: CandleDatum): string {
  if (point.open === null) return '#90a1b9';
  if (point.close > point.open) return '#00d492';
  if (point.close < point.open) return '#ff6467';
  return '#90a1b9';
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
  return point.periodEnd
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

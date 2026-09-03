import { OHLCPoint } from '../../data/fixtures/ohlc';

// Pure candle geometry, kept out of CandlestickChart.tsx so it stays a
// component-only module: exporting helpers alongside the component breaks
// fast refresh, and this logic needs no React to be tested.

/** The filled body of a candle, spanning open to close in either direction. */
export function candleBody(point: OHLCPoint): [number, number] {
  return [Math.min(point.open, point.close), Math.max(point.open, point.close)];
}

/** Lower and upper wick lengths, measured out from the body. */
export function candleWick(point: OHLCPoint): [number, number] {
  const bodyHigh = Math.max(point.open, point.close);
  return [bodyHigh - point.low, point.high - bodyHigh];
}

export function candleColor(point: OHLCPoint): string {
  if (point.close > point.open) return '#00d492';
  if (point.close < point.open) return '#ff6467';
  return '#90a1b9';
}

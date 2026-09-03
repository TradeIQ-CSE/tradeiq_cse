import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { OHLCPoint } from '../../data/fixtures/ohlc';
import { candleBody, candleColor, candleWick } from './candlestick';
import { CandlestickChart } from './CandlestickChart';

function point(overrides: Partial<OHLCPoint>): OHLCPoint {
  return {
    date: '2026-01-05',
    open: 100,
    high: 110,
    low: 90,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

describe('candleBody', () => {
  it('spans [open, close] when open is below close', () => {
    expect(candleBody(point({ open: 100, close: 108 }))).toEqual([100, 108]);
  });

  it('spans [close, open] when close is below open', () => {
    expect(candleBody(point({ open: 108, close: 100 }))).toEqual([100, 108]);
  });
});

describe('candleWick', () => {
  it('splits into the segment below and above the body', () => {
    // body high = max(open, close) = 108; low = 90, high = 115
    const p = point({ open: 100, close: 108, low: 90, high: 115 });
    expect(candleWick(p)).toEqual([108 - 90, 115 - 108]);
  });

  it('uses the body high from a bearish candle too', () => {
    // body high = max(open, close) = 108 (open here); low = 95, high = 112
    const p = point({ open: 108, close: 101, low: 95, high: 112 });
    expect(candleWick(p)).toEqual([108 - 95, 112 - 108]);
  });
});

describe('candleColor', () => {
  it('is the up colour when close is above open', () => {
    expect(candleColor(point({ open: 100, close: 105 }))).toBe('#00d492');
  });

  it('is the down colour when close is below open', () => {
    expect(candleColor(point({ open: 105, close: 100 }))).toBe('#ff6467');
  });

  it('is the flat colour when close equals open', () => {
    expect(candleColor(point({ open: 100, close: 100 }))).toBe('#90a1b9');
  });
});

describe('CandlestickChart', () => {
  it('renders without throwing (smoke only)', () => {
    // jsdom reports zero element size for every node, so recharts'
    // ResponsiveContainer resolves to a 0x0 area and draws no bars/axes.
    // Asserting on rendered chart elements here would be vacuous; this only
    // proves the component mounts and unmounts cleanly.
    const data = [
      point({ date: '2026-01-05', open: 100, high: 110, low: 90, close: 104 }),
      point({ date: '2026-01-06', open: 104, high: 112, low: 101, close: 99 }),
    ];

    const { container } = render(<CandlestickChart data={data} />);

    expect(container.firstChild).toBeInTheDocument();
  });
});

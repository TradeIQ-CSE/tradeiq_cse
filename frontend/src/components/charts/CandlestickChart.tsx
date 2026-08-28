import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  CartesianGrid,
  TooltipProps,
} from 'recharts';
import { OHLCPoint } from '../../data/fixtures/ohlc';

export interface OHLCDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  data: OHLCPoint[];
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: OHLCDataPoint;
  priceDomain?: number[];
}

interface TooltipPayloadItem {
  payload: OHLCDataPoint;
  name: string;
  value: number;
  color?: string;
}

interface TooltipContentProps extends Omit<TooltipProps<number, string>, 'payload'> {
  payload?: TooltipPayloadItem[];
}

const Candlestick: React.FC<BarShapeProps> = (props) => {
  const { x, y, width, height, payload, priceDomain } = props;

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    !payload ||
    !priceDomain ||
    priceDomain.length < 2
  ) {
    return null;
  }

  const { open, close, high, low } = payload;
  const minDomainVal = priceDomain[0];
  const diff = minDomainVal - close;
  const A = diff !== 0 ? height / diff : 0;

  const openY = y + A * (open - close);
  const closeY = y;
  const highY = y + A * (high - close);
  const lowY = y + A * (low - close);

  const isDoji = open === close;
  const isUp = close > open;
  const color = isDoji ? '#90a1b9' : (isUp ? '#00d492' : '#ff6467');

  const cx = x + width / 2;

  if (isDoji) {
    return (
      <g>
        {/* Wick (high to low) */}
        <line
          x1={cx}
          y1={highY}
          x2={cx}
          y2={lowY}
          stroke={color}
          strokeWidth={1.5}
        />
        {/* Horizontal Doji flat body crossbar */}
        <line
          x1={x}
          y1={openY}
          x2={x + width}
          y2={openY}
          stroke={color}
          strokeWidth={2}
        />
      </g>
    );
  }

  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(openY - closeY), 1.5);

  return (
    <g>
      {/* Wick (high to low) */}
      <line
        x1={cx}
        y1={highY}
        x2={cx}
        y2={lowY}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Candle Body */}
      <rect
        x={x}
        y={bodyTop}
        width={width}
        height={bodyHeight}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data }) => {
  // Find min/max for prices to pad the domain including all OHLC bounds
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVol = 0;

  if (data && data.length > 0) {
    for (const val of data) {
      if (val.low < minPrice) minPrice = val.low;
      if (val.high > maxPrice) maxPrice = val.high;
      if (val.volume > maxVol) maxVol = val.volume;
    }
  }

  // Safe fallback domain if data is empty or invalid
  const hasValidPrices = minPrice !== Infinity && maxPrice !== -Infinity;
  const priceDomain = hasValidPrices
    ? [Math.floor(minPrice * 0.98), Math.ceil(maxPrice * 1.02)]
    : [100, 200];

  // Set volume domain high (e.g. 4x max volume) so volume bars stay at the bottom 25% of the chart
  const volumeDomain = [0, Math.max(maxVol, 100) * 4];

  const CustomTooltip: React.FC<TooltipContentProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const isDoji = dataPoint.close === dataPoint.open;
      const isUp = dataPoint.close > dataPoint.open;
      const color = isDoji ? '#90a1b9' : (isUp ? '#00d492' : '#ff6467');

      return (
        <div
          style={{
            backgroundColor: '#12131f',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '10px 14px',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#90a1b9' }}>
            Date: {dataPoint.date}
          </div>
          <div>
            Open:{' '}
            <span style={{ fontFamily: 'monospace' }}>
              {dataPoint.open.toFixed(2)}
            </span>
          </div>
          <div>
            High:{' '}
            <span style={{ fontFamily: 'monospace' }}>
              {dataPoint.high.toFixed(2)}
            </span>
          </div>
          <div>
            Low:{' '}
            <span style={{ fontFamily: 'monospace' }}>
              {dataPoint.low.toFixed(2)}
            </span>
          </div>
          <div>
            Close:{' '}
            <span style={{ fontWeight: 'bold', color, fontFamily: 'monospace' }}>
              {dataPoint.close.toFixed(2)}
            </span>
          </div>
          <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px' }}>
            Volume:{' '}
            <span style={{ fontFamily: 'monospace', color: '#90a1b9' }}>
              {dataPoint.volume.toLocaleString()}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          
          <XAxis
            dataKey="date"
            stroke="#45556c"
            tick={{ fill: '#90a1b9', fontSize: 10 }}
            tickLine={{ stroke: '#45556c' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          />

          <YAxis
            yAxisId="price"
            domain={priceDomain}
            orientation="left"
            stroke="#45556c"
            tick={{ fill: '#90a1b9', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#45556c' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          />

          <YAxis
            yAxisId="volume"
            domain={volumeDomain}
            orientation="right"
            display="none"
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Render the candlestick using shape configuration and datakey mapping */}
          <Bar
            yAxisId="price"
            dataKey="close"
            shape={<Candlestick priceDomain={priceDomain} />}
          />

          {/* Render volume bars overlayed at the bottom */}
          <Bar
            yAxisId="volume"
            dataKey="volume"
            fill="rgba(114, 46, 209, 0.15)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

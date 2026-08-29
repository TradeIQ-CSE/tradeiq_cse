import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { OHLCPoint } from '../../data/fixtures/ohlc';

interface CandlestickChartProps {
  data: readonly OHLCPoint[];
}

interface TooltipPayloadItem {
  payload: OHLCPoint;
}

interface CandlestickTooltipProps
  extends Omit<TooltipProps<number, string>, 'payload'> {
  payload?: TooltipPayloadItem[];
}

function candleBody(point: OHLCPoint): [number, number] {
  return [Math.min(point.open, point.close), Math.max(point.open, point.close)];
}

function candleWick(point: OHLCPoint): [number, number] {
  const bodyHigh = Math.max(point.open, point.close);
  return [bodyHigh - point.low, point.high - bodyHigh];
}

function candleColor(point: OHLCPoint): string {
  if (point.close > point.open) return '#00d492';
  if (point.close < point.open) return '#ff6467';
  return '#90a1b9';
}

function CandlestickTooltip({ active, payload }: CandlestickTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

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
      <div
        style={{ fontWeight: 700, marginBottom: '6px', color: '#90a1b9' }}
      >
        Date: {point.date}
      </div>
      <div>Open: {point.open.toFixed(2)}</div>
      <div>High: {point.high.toFixed(2)}</div>
      <div>Low: {point.low.toFixed(2)}</div>
      <div style={{ color: candleColor(point) }}>
        Close: {point.close.toFixed(2)}
      </div>
      <div>Volume: {point.volume.toLocaleString()}</div>
    </div>
  );
}

export function CandlestickChart({ data }: CandlestickChartProps) {
  const prices = data.flatMap((point) => [point.low, point.high]);
  const minimumPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maximumPrice = prices.length > 0 ? Math.max(...prices) : 1;
  const padding = Math.max((maximumPrice - minimumPrice) * 0.05, 1);
  const priceDomain: [number, number] = [
    minimumPrice - padding,
    maximumPrice + padding,
  ];

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...data]}
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
            domain={priceDomain}
            stroke="#45556c"
            tick={{ fill: '#90a1b9', fontSize: 10, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#45556c' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          />
          <Tooltip content={<CandlestickTooltip />} />
          <Bar
            dataKey={candleBody}
            isAnimationActive={false}
            maxBarSize={12}
            minPointSize={2}
          >
            {data.map((point) => (
              <Cell key={point.date} fill={candleColor(point)} />
            ))}
            <ErrorBar
              dataKey={candleWick}
              width={0}
              stroke="#90a1b9"
              strokeWidth={1.25}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

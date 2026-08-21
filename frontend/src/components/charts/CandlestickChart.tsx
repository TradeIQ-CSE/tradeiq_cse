import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
} from "recharts";
import { OHLCDataPoint } from "../../data/fixtures/ohlc";

interface CandlestickChartProps {
  data: OHLCDataPoint[];
  height?: number;
}

// Custom Candlestick shape renderer
const Candlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const { open, close, high, low } = payload;
  const isUp = close >= open;
  // Trading standard colors: #26a69a (teal/green) for gains, #ef5350 (red) for losses
  const color = isUp ? "#26a69a" : "#ef5350";

  const topVal = Math.max(open, close);
  const botVal = Math.min(open, close);
  const valDiff = topVal - botVal || 0.001; // Avoid division by zero

  const scale = height / valDiff;
  const highY = y - (high - topVal) * scale;
  const lowY = y + height + (botVal - low) * scale;
  const cx = x + width / 2;

  return (
    <g>
      {/* High-Low Wick */}
      <line
        x1={cx}
        y1={highY}
        x2={cx}
        y2={lowY}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Open-Close Candle Body */}
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(height, 2)}
        fill={color}
        stroke={color}
      />
    </g>
  );
};

// Custom tooltip renderer for a trading terminal look
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isUp = data.close >= data.open;
    const color = isUp ? "#26a69a" : "#ef5350";

    return (
      <div
        style={{
          background: "#1b2230",
          border: "1px solid #2a3343",
          padding: "10px 14px",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ color: "#9aa4b2", fontSize: 12, marginBottom: 4 }}>
          {data.date}
        </div>
        <div style={{ fontSize: 14, fontWeight: "bold", color }}>
          {isUp ? "Bullish Candle" : "Bearish Candle"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 12px", marginTop: 6, fontSize: 13 }}>
          <span style={{ color: "#9aa4b2" }}>Open:</span>
          <span style={{ color: "#e6e9f0", textAlign: "right" }}>{data.open.toFixed(2)}</span>
          
          <span style={{ color: "#9aa4b2" }}>High:</span>
          <span style={{ color: "#e6e9f0", textAlign: "right" }}>{data.high.toFixed(2)}</span>
          
          <span style={{ color: "#9aa4b2" }}>Low:</span>
          <span style={{ color: "#e6e9f0", textAlign: "right" }}>{data.low.toFixed(2)}</span>
          
          <span style={{ color: "#9aa4b2" }}>Close:</span>
          <span style={{ color: "#e6e9f0", textAlign: "right", fontWeight: "bold" }}>{data.close.toFixed(2)}</span>

          <span style={{ color: "#9aa4b2" }}>Volume:</span>
          <span style={{ color: "#e6e9f0", textAlign: "right" }}>{data.volume.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  return null;
};

export function CandlestickChart({ data, height = 350 }: CandlestickChartProps) {
  // Pre-process data for range bars
  // Recharts Bar component can take an array [min, max] as its value
  const chartData = data.map((d) => ({
    ...d,
    // range for the bar body
    range: [d.open, d.close],
  }));

  // Calculate volume domain to fit in the bottom 20% of the chart
  const maxVolume = Math.max(...data.map((d) => d.volume));

  return (
    <div style={{ width: "100%", height, background: "transparent" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
        >
          <XAxis
            dataKey="date"
            tick={{ fill: "#9aa4b2", fontSize: 11 }}
            axisLine={{ stroke: "#2a3343" }}
            tickLine={{ stroke: "#2a3343" }}
          />
          {/* Price Axis (Right) */}
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={["auto", "auto"]}
            tick={{ fill: "#9aa4b2", fontSize: 11 }}
            axisLine={{ stroke: "#2a3343" }}
            tickLine={{ stroke: "#2a3343" }}
            tickFormatter={(v) => v.toFixed(0)}
          />
          {/* Volume Axis (Left, hidden or scaled down) */}
          <YAxis
            yAxisId="volume"
            orientation="left"
            domain={[0, maxVolume * 5]}
            hide
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Volume Bar Chart */}
          <Bar yAxisId="volume" dataKey="volume">
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.close >= entry.open ? "rgba(38, 166, 154, 0.15)" : "rgba(239, 83, 80, 0.15)"}
              />
            ))}
          </Bar>
          {/* Candlestick Body & Wick Chart */}
          <Bar
            yAxisId="price"
            dataKey="range"
            shape={<Candlestick />}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

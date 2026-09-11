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
} from "recharts";
import {
  candleBody,
  candleColor,
  candleWick,
  ChartDatum,
  chartDateLabel,
  chartTickLabel,
} from "./candlestick";
import { chartPalette } from "./chart-theme";

interface CandlestickChartProps {
  data: readonly ChartDatum[];
  locale?: string;
  accessibleLabel?: string;
  labels?: Partial<CandlestickChartLabels>;
}

interface CandlestickChartLabels {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  adjustedClose: string;
  volume: string;
}

const DEFAULT_LABELS: CandlestickChartLabels = {
  date: "Date",
  open: "Open",
  high: "High",
  low: "Low",
  close: "Close",
  adjustedClose: "Adjusted close",
  volume: "Volume",
};

interface TooltipPayloadItem {
  payload: ChartDatum;
}

const VALUE_AXIS_WIDTH = 54;

interface CandlestickTooltipProps extends Omit<
  TooltipProps<number, string>,
  "payload"
> {
  payload?: TooltipPayloadItem[];
}

function formatNumber(value: number, locale: string, decimals = 2): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function CandlestickTooltip({
  active,
  payload,
  locale,
  labels,
}: CandlestickTooltipProps & {
  locale: string;
  labels: CandlestickChartLabels;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
      <div className="mb-1 text-text-secondary">
        {chartDateLabel(point, locale)}
      </div>
      <div>
        {labels.open}:{" "}
        {point.open === null ? "—" : formatNumber(point.open, locale)}
      </div>
      <div>
        {labels.high}: {formatNumber(point.high, locale)}
      </div>
      <div>
        {labels.low}: {formatNumber(point.low, locale)}
      </div>
      <div style={{ color: candleColor(point) }}>
        {labels.close}: {formatNumber(point.close, locale)}
      </div>
      {point.adjustedClose !== undefined && (
        <div>
          {labels.adjustedClose}:{" "}
          {point.adjustedClose === null
            ? "—"
            : formatNumber(point.adjustedClose, locale)}
        </div>
      )}
      <div>
        {labels.volume}: {point.volume.toLocaleString(locale)}
      </div>
    </div>
  );
}

export function CandlestickChart({
  data,
  locale = "en-US",
  accessibleLabel = "OHLCV price and volume chart",
  labels: labelOverrides,
}: CandlestickChartProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const showsAdjustedClose = data.some(
    (point) => point.adjustedClose !== undefined,
  );
  const prices = data.flatMap((point) => [point.low, point.high]);
  const minimumPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maximumPrice = prices.length > 0 ? Math.max(...prices) : 1;
  const padding = Math.max((maximumPrice - minimumPrice) * 0.05, 1);
  const priceDomain: [number, number] = [
    minimumPrice - padding,
    maximumPrice + padding,
  ];

  return (
    <div
      className="relative h-[320px] w-full min-w-0 max-w-full overflow-hidden sm:h-[360px]"
      role="group"
      aria-label={accessibleLabel}
    >
      <div
        className="h-[230px] w-full min-w-0 max-w-full sm:h-[265px]"
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data]}
            margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke={chartPalette.grid}
              strokeOpacity={0.35}
            />
            <XAxis dataKey="date" hide stroke={chartPalette.axis} />
            <YAxis
              domain={priceDomain}
              width={VALUE_AXIS_WIDTH}
              stroke={chartPalette.axis}
              tickCount={4}
              tickFormatter={(value: number) => formatNumber(value, locale)}
              tick={{
                fill: chartPalette.tick,
                fontSize: 10,
                fontFamily: "monospace",
              }}
              tickLine={{ stroke: chartPalette.axis }}
              axisLine={{ stroke: chartPalette.axis }}
            />
            <Tooltip
              cursor={{ fill: chartPalette.cursor, fillOpacity: 0.35 }}
              content={<CandlestickTooltip locale={locale} labels={labels} />}
            />
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
                stroke={chartPalette.neutral}
                strokeWidth={1.25}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[15px] pl-[55px] text-caption-2-medium uppercase tracking-wider text-text-tertiary">
        {labels.volume}
      </div>
      <div
        className="h-[75px] w-full min-w-0 max-w-full sm:h-[80px]"
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data]}
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke={chartPalette.grid}
              strokeOpacity={0.3}
            />
            <XAxis
              dataKey="date"
              minTickGap={28}
              stroke={chartPalette.axis}
              tickFormatter={(day: string) => chartTickLabel(day, locale)}
              tick={{ fill: chartPalette.tick, fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: chartPalette.axis }}
            />
            {/*
              Keep this axis in the layout even though it has no visible
              decoration. Recharts removes the width of an axis with `hide`,
              which gives this chart a wider category band than the price
              chart and shifts volume bars away from their candles.
            */}
            <YAxis
              width={VALUE_AXIS_WIDTH}
              tick={false}
              tickLine={false}
              axisLine={false}
            />
            <Bar dataKey="volume" isAnimationActive={false} maxBarSize={12}>
              {data.map((point) => (
                <Cell
                  key={`${point.date}-${point.periodEnd ?? ""}-volume`}
                  fill={candleColor(point)}
                  fillOpacity={0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>{accessibleLabel}</caption>
        <thead>
          <tr>
            <th>{labels.date}</th>
            <th>{labels.open}</th>
            <th>{labels.high}</th>
            <th>{labels.low}</th>
            <th>{labels.close}</th>
            {showsAdjustedClose && <th>{labels.adjustedClose}</th>}
            <th>{labels.volume}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={`${point.date}-${point.periodEnd ?? ""}-accessible`}>
              <th>{chartDateLabel(point, locale)}</th>
              <td>
                {point.open === null ? "—" : formatNumber(point.open, locale)}
              </td>
              <td>{formatNumber(point.high, locale)}</td>
              <td>{formatNumber(point.low, locale)}</td>
              <td>{formatNumber(point.close, locale)}</td>
              {showsAdjustedClose && (
                <td>
                  {point.adjustedClose === undefined ||
                  point.adjustedClose === null
                    ? "—"
                    : formatNumber(point.adjustedClose, locale)}
                </td>
              )}
              <td>{point.volume.toLocaleString(locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

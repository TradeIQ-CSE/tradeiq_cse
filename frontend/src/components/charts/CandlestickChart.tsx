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
import {
  candleBody,
  candleColor,
  candleWick,
  ChartDatum,
  chartDateLabel,
  chartTickLabel,
} from './candlestick';
import './candlestick-chart.css';

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
  date: 'Date',
  open: 'Open',
  high: 'High',
  low: 'Low',
  close: 'Close',
  adjustedClose: 'Adjusted close',
  volume: 'Volume',
};

interface TooltipPayloadItem {
  payload: ChartDatum;
}

interface CandlestickTooltipProps
  extends Omit<TooltipProps<number, string>, 'payload'> {
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
    <div className="candlestick-tooltip">
      <div className="candlestick-tooltip__date">{chartDateLabel(point, locale)}</div>
      <div>
        {labels.open}: {point.open === null ? '—' : formatNumber(point.open, locale)}
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
          {labels.adjustedClose}:{' '}
          {point.adjustedClose === null
            ? '—'
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
  locale = 'en-US',
  accessibleLabel = 'OHLCV price and volume chart',
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
    <div className="candlestick-chart" role="group" aria-label={accessibleLabel}>
      <div className="candlestick-chart__price" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data]}
            margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              hide
              stroke="#45556c"
            />
            <YAxis
              domain={priceDomain}
              width={54}
              stroke="#45556c"
              tickCount={4}
              tickFormatter={(value: number) => formatNumber(value, locale)}
              tick={{ fill: '#90a1b9', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={{ stroke: '#45556c' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            />
            <Tooltip
              content={
                <CandlestickTooltip locale={locale} labels={labels} />
              }
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
                stroke="#90a1b9"
                strokeWidth={1.25}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="candlestick-chart__volume-label">{labels.volume}</div>
      <div className="candlestick-chart__volume" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data]}
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.035)" />
            <XAxis
              dataKey="date"
              minTickGap={28}
              stroke="#45556c"
              tickFormatter={(day: string) => chartTickLabel(day, locale)}
              tick={{ fill: '#64748b', fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            />
            <YAxis width={54} hide />
            <Bar dataKey="volume" isAnimationActive={false} maxBarSize={12}>
              {data.map((point) => (
                <Cell
                  key={`${point.date}-${point.periodEnd ?? ''}-volume`}
                  fill={candleColor(point)}
                  fillOpacity={0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="candlestick-chart__table">
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
            <tr key={`${point.date}-${point.periodEnd ?? ''}-accessible`}>
              <th>{chartDateLabel(point, locale)}</th>
              <td>{point.open === null ? '—' : formatNumber(point.open, locale)}</td>
              <td>{formatNumber(point.high, locale)}</td>
              <td>{formatNumber(point.low, locale)}</td>
              <td>{formatNumber(point.close, locale)}</td>
              {showsAdjustedClose && (
                <td>
                  {point.adjustedClose === undefined || point.adjustedClose === null
                    ? '—'
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

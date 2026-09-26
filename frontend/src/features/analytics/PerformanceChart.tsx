import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartPalette } from '../../components/charts/chart-theme';
import { formatDay } from '../paper-trading/format';
import type { BenchmarkCode, PerformancePoint } from './api';

export interface PerformanceSeries {
  key: 'yours' | BenchmarkCode;
  label: string;
  color: string;
}

interface Row {
  date: string;
  yours: number;
  ASPI: number | null;
  SL20: number | null;
}

const signed = (value: number, locale: string) =>
  `${value.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  })}%`;

function shortDay(day: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * Your return and the market's over the same days, both starting at 0%, so
 * the gap between the lines is how far ahead or behind you are.
 */
export function PerformanceChart({
  points,
  series,
  locale,
  accessibleLabel,
  dateLabel,
  height = 240,
}: {
  points: readonly PerformancePoint[];
  series: readonly PerformanceSeries[];
  locale: string;
  accessibleLabel: string;
  dateLabel: string;
  height?: number;
}) {
  const rows: Row[] = points.map((point) => ({
    date: point.date,
    yours: point.return_pct,
    ASPI: point.benchmarks.ASPI,
    SL20: point.benchmarks.SL20,
  }));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-hidden>
        {series.map((line) => (
          <li key={line.key} className="flex items-center gap-2 text-body-2-medium text-text-secondary">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: line.color }} />
            {line.label}
          </li>
        ))}
      </ul>

      <div className="w-full min-w-0" style={{ height }} role="group" aria-label={accessibleLabel}>
        <div className="h-full w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartPalette.grid} strokeOpacity={0.35} />
              <ReferenceLine y={0} stroke={chartPalette.axis} />
              <XAxis
                dataKey="date"
                minTickGap={32}
                stroke={chartPalette.axis}
                tickLine={false}
                tickFormatter={(day: string) => shortDay(day, locale)}
                tick={{ fill: chartPalette.tick, fontSize: 10 }}
              />
              <YAxis
                width={56}
                stroke={chartPalette.axis}
                tickCount={4}
                tickFormatter={(value: number) => signed(value, locale)}
                tick={{ fill: chartPalette.tick, fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: chartPalette.axis, strokeOpacity: 0.7 }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as Row | undefined;
                  if (!active || !row) return null;
                  return (
                    <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
                      <div className="mb-1 text-text-secondary">{formatDay(row.date, locale)}</div>
                      {series.map((line) => {
                        const value = row[line.key];
                        return (
                          <div key={line.key} className="flex items-center gap-2">
                            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: line.color }} />
                            {line.label}: {value === null ? '—' : signed(value, locale)}
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              {series.map((line) => (
                <Line
                  key={line.key}
                  type="linear"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={line.key === 'yours' ? 2.5 : 1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <table className="sr-only">
          <caption>{accessibleLabel}</caption>
          <thead>
            <tr>
              <th>{dateLabel}</th>
              {series.map((line) => (
                <th key={line.key}>{line.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <td>{formatDay(row.date, locale)}</td>
                {series.map((line) => {
                  const value = row[line.key];
                  return <td key={line.key}>{value === null ? '—' : signed(value, locale)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { chartPalette } from "./chart-theme";
import { DEFAULT_GAP_LABELS, GapBands, GapLabels, gapRowText, gapText } from "./gap-band";
import { DataGap, GapTimeframe, gapRuns, withGapSlots } from "../../lib/data-gaps";

export interface IndexChartPoint {
  date: string;
  /** Present for a weekly/monthly bucket; the last real date it covers. */
  periodEnd?: string;
  /** `null` only for a gap slot — see `withGapSlots` (lib/data-gaps.ts). */
  close: number | null;
  /** Present only for a gap slot. */
  gap?: DataGap;
}

interface IndexLineChartProps {
  data: readonly IndexChartPoint[];
  locale?: string;
  accessibleLabel?: string;
  dateLabel?: string;
  closeLabel?: string;
  /** Compact by default for the Markets page summary cards. */
  height?: number;
  /** Drives gap-slot insertion; matches CandlestickChart's own prop. */
  timeframe?: GapTimeframe;
  /** Coverage gaps to render as slots (docs/plans/data-gap-handling.md §3–4). */
  gaps?: readonly DataGap[];
  /**
   * Reuses CandlestickChart's own gap-label shape rather than three more
   * flat props: the two charts share the exact same band/tooltip/sr-row
   * vocabulary (gap-band.tsx), and a caller wiring up gaps for both wants
   * one label set, not two differently-shaped ones.
   */
  gapLabels?: Partial<GapLabels>;
}

/** Builds a gap slot in `IndexChartPoint`'s own shape: a null close, the gap
 * it belongs to attached. See `withGapSlots` (lib/data-gaps.ts). */
function gapIndexPoint(
  date: string,
  periodEnd: string | undefined,
  gap: DataGap,
): IndexChartPoint {
  return { date, periodEnd, close: null, gap };
}

// Wider than CandlestickChart's axis: index levels (e.g. "22,624.31") run to
// five digits plus a thousands separator, unlike individual security prices.
const VALUE_AXIS_WIDTH = 72;

function asUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function formatTick(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(asUtcDate(day));
}

function tickYear(day: string): number {
  return asUtcDate(day).getUTCFullYear();
}

interface AxisTickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
}

/**
 * A trailing window can cross a year boundary (e.g. Jan back to the prior
 * December), so "Feb 5" alone can read as the wrong year. Recharts only
 * accepts a single-line string from `tickFormatter`, so the year goes on its
 * own line via a custom tick element instead.
 */
function makeAxisTick(locale: string) {
  return function AxisTick({ x = 0, y = 0, payload }: AxisTickProps) {
    if (!payload) return null;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          textAnchor="middle"
          fill={chartPalette.tick}
          fontSize={9}
        >
          <tspan x={0} dy="0.9em">
            {formatTick(payload.value, locale)}
          </tspan>
          <tspan x={0} dy="1.1em">
            {tickYear(payload.value)}
          </tspan>
        </text>
      </g>
    );
  };
}

function formatDateLabel(point: IndexChartPoint, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const start = formatter.format(asUtcDate(point.date));
  return point.periodEnd && point.periodEnd !== point.date
    ? `${start} – ${formatter.format(asUtcDate(point.periodEnd))}`
    : start;
}

// Accepts null so a gap slot's close can pass through the same formatter as
// a real one; in practice this branch is never reached, since a slot's
// tooltip short-circuits to the gap label below instead.
function formatNumber(value: number | null, locale: string): string {
  if (value === null) return "—";
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface TooltipPayloadItem {
  payload: IndexChartPoint;
}

export function IndexChartTooltip({
  active,
  payload,
  locale,
  dateLabel,
  closeLabel,
  gapLabels,
}: Omit<TooltipProps<number, string>, "payload"> & {
  payload?: TooltipPayloadItem[];
  locale: string;
  dateLabel: string;
  closeLabel: string;
  gapLabels: GapLabels;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  if (point.gap) {
    return (
      <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
        <div className="mb-1 text-text-secondary">
          {dateLabel}: {formatDateLabel(point, locale)}
        </div>
        <div>{gapText(point.gap, locale, gapLabels)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
      <div className="mb-1 text-text-secondary">
        {dateLabel}: {formatDateLabel(point, locale)}
      </div>
      <div>
        {closeLabel}: {formatNumber(point.close, locale)}
      </div>
    </div>
  );
}

/**
 * A compact close-only trend line for market indices, which never carry
 * open/high/low/volume (endpoint-catalogue-v0.md §9/§10) — plotting them with
 * `CandlestickChart` would mean fabricating those fields.
 */
export function IndexLineChart({
  data,
  locale = "en-US",
  accessibleLabel = "Index close-price history",
  dateLabel = "Date",
  closeLabel = "Close",
  height = 188,
  timeframe = "daily",
  gaps = [],
  gapLabels: gapLabelOverrides,
}: IndexLineChartProps) {
  const gapLabels = { ...DEFAULT_GAP_LABELS, ...gapLabelOverrides };
  const AxisTick = useMemo(() => makeAxisTick(locale), [locale]);
  const slottedData = withGapSlots(data, gaps, timeframe, gapIndexPoint);
  // Slots carry no price, so they're ignored for both the axis domain and
  // (in the sr-only table below) the per-point rows — the same rule
  // CandlestickChart's windowDomain/domainBars follow.
  const closes = slottedData
    .map((point) => point.close)
    .filter((close): close is number => close !== null);
  const minimumClose = closes.length > 0 ? Math.min(...closes) : 0;
  const maximumClose = closes.length > 0 ? Math.max(...closes) : 1;
  const padding = Math.max((maximumClose - minimumClose) * 0.05, 1);
  const priceDomain: [number, number] = [
    minimumClose - padding,
    maximumClose + padding,
  ];
  // This chart shows its whole series at once (no pan/zoom window like
  // CandlestickChart), so every run in the series is "visible" — one band
  // per gap, and one sr-only row per gap for the same reason.
  const bandRuns = gapRuns(slottedData);
  const runByStartIndex = new Map(bandRuns.map((run) => [run.startIndex, run]));

  return (
    <div
      className="w-full min-w-0 max-w-full"
      style={{ height }}
      role="group"
      aria-label={accessibleLabel}
    >
      <div className="h-full w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={slottedData}
            margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke={chartPalette.grid}
              strokeOpacity={0.35}
            />
            <GapBands runs={bandRuns} locale={locale} labels={gapLabels} />
            <XAxis
              dataKey="date"
              scale="band"
              height={32}
              minTickGap={28}
              stroke={chartPalette.axis}
              tick={AxisTick}
              tickLine={false}
              axisLine={{ stroke: chartPalette.axis }}
            />
            <YAxis
              domain={priceDomain}
              // Without this, Recharts ignores an explicit numeric `domain`
              // and recomputes one from the data instead; with every close
              // null (this chart's `data` itself all gap slots — it has no
              // pan/zoom window to land entirely on a gap the way
              // CandlestickChart does) that recomputation finds nothing, and
              // the axis draws no ticks rather than falling back to
              // `priceDomain` (docs/plans/data-gap-handling.md §4).
              allowDataOverflow
              width={VALUE_AXIS_WIDTH}
              stroke={chartPalette.axis}
              tickCount={3}
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
              cursor={{ stroke: chartPalette.axis, strokeOpacity: 0.7 }}
              content={
                <IndexChartTooltip
                  locale={locale}
                  dateLabel={dateLabel}
                  closeLabel={closeLabel}
                  gapLabels={gapLabels}
                />
              }
            />
            <Line
              type="linear"
              dataKey="close"
              stroke={chartPalette.price}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: chartPalette.price }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>{accessibleLabel}</caption>
        <thead>
          <tr>
            <th>{dateLabel}</th>
            <th>{closeLabel}</th>
          </tr>
        </thead>
        <tbody>
          {slottedData.map((point, index) => {
            const run = runByStartIndex.get(index);
            if (run) {
              return (
                <tr key={`gap-${run.gap.kind}-${run.gap.from}-${run.gap.to}`}>
                  <th scope="row" colSpan={2}>
                    {gapRowText(run.gap, locale, gapLabels)}
                  </th>
                </tr>
              );
            }
            if (point.gap) return null; // an interior slot of an already-emitted run

            return (
              <tr key={`${point.date}-${point.periodEnd ?? ""}`}>
                <th>{formatDateLabel(point, locale)}</th>
                <td>{formatNumber(point.close, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  candleBody,
  candleColor,
  candleWick,
  ChartDatum,
  chartDateLabel,
  chartTickLabel,
  domainBars,
  volumeDomain,
  windowDomain,
  withCandleComparisons,
} from "./candlestick";
import { chartPalette } from "./chart-theme";
import { DEFAULT_GAP_LABELS, GapBands, GapLabels, gapRowText, gapText } from "./gap-band";
import { useChartWindow } from "./useChartWindow";
import { DataGap, GapTimeframe, gapRuns, withGapSlots } from "../../lib/data-gaps";

interface CandlestickChartProps {
  data: readonly ChartDatum[];
  mode?: "candlestick" | "close";
  /** Drives gap-slot insertion: daily gets one slot per weekday, weekly and
   * monthly one per week/month entirely inside a gap. Defaults to "daily",
   * which is a no-op when `gaps` is empty either way. */
  timeframe?: GapTimeframe;
  /** Coverage gaps to render as slots (docs/plans/data-gap-handling.md §3–4).
   * Omit or pass an empty array for a chart with no known gaps — the chart
   * renders exactly as it did before this prop existed. */
  gaps?: readonly DataGap[];
  locale?: string;
  accessibleLabel?: string;
  labels?: Partial<CandlestickChartLabels>;
}

interface CandlestickChartLabels extends GapLabels {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  adjustedClose: string;
  volume: string;
  zoomIn: string;
  zoomOut: string;
}

// Exported for CandlestickTooltip's own unit tests (CandlestickChart.test.tsx)
// rather than only exercised indirectly through full chart renders, where a
// gap slot's tiny on-screen position makes a real hover hard to simulate.
export const DEFAULT_LABELS: CandlestickChartLabels = {
  ...DEFAULT_GAP_LABELS,
  date: "Date",
  open: "Open",
  high: "High",
  low: "Low",
  close: "Close",
  adjustedClose: "Adjusted close",
  volume: "Volume",
  zoomIn: "Show fewer periods",
  zoomOut: "Show more periods",
};

/** Builds a gap slot in `ChartDatum`'s own shape: every price field null, the
 * gap it belongs to attached. See `withGapSlots` (lib/data-gaps.ts). */
function gapChartDatum(
  date: string,
  periodEnd: string | undefined,
  gap: DataGap,
): ChartDatum {
  return {
    date,
    periodEnd: periodEnd ?? null,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    gap,
  };
}

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

// Accepts null so the tooltip can stay one code path even though a gap
// slot's fields are all null; the null branch is never actually reached for
// those, since a slot short-circuits to the gap-label render below instead.
function formatNumber(value: number | null, locale: string, decimals = 2): string {
  if (value === null) return "—";
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function CandlestickTooltip({
  active,
  payload,
  locale,
  labels,
  mode,
}: CandlestickTooltipProps & {
  locale: string;
  labels: CandlestickChartLabels;
  mode: "candlestick" | "close";
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  // A gap slot has no prices to show — the label replaces them entirely
  // rather than showing a stack of em dashes.
  if (point.gap) {
    return (
      <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
        <div className="mb-1 text-text-secondary">
          {chartDateLabel(point, locale)}
        </div>
        <div>{gapText(point.gap, locale, labels)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
      <div className="mb-1 text-text-secondary">
        {chartDateLabel(point, locale)}
      </div>
      {mode === "candlestick" && (
        <div>
          {labels.open}: {formatNumber(point.open, locale)}
        </div>
      )}
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
          {labels.adjustedClose}: {formatNumber(point.adjustedClose, locale)}
        </div>
      )}
      <div>
        {labels.volume}: {formatNumber(point.volume, locale, 0)}
      </div>
    </div>
  );
}

export function CandlestickChart({
  data,
  mode = "candlestick",
  timeframe = "daily",
  gaps = [],
  locale = "en-US",
  accessibleLabel = "OHLCV price and volume chart",
  labels: labelOverrides,
}: CandlestickChartProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  // Slots go in first, so withCandleComparisons (which walks past a slot's
  // null close to find the last *real* close) sees them; then the CSE-open
  // fallback below runs over the whole slotted series unchanged.
  //
  // The CSE source can provide a period high/low/close while leaving open
  // unavailable. Keep the missing open intact for geometry and disclosure,
  // but compare close with the previous period's close so direction colour
  // remains meaningful. A real open always wins when the API provides one.
  const plottedData = withCandleComparisons(
    withGapSlots(data, gaps, timeframe, gapChartDatum),
  );
  const showsAdjustedClose = data.some(
    (point) => point.adjustedClose !== undefined,
  );
  // date + (open, only for candlesticks) + high + low + close +
  // (adjustedClose, only when the source has it) + volume — used to span a
  // gap's summary row across every column the real rows have.
  const columnCount =
    1 + (mode === "candlestick" ? 1 : 0) + 3 + (showsAdjustedClose ? 1 : 0) + 1;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  // The window is measured in bars, so it needs the pixel width the bars are
  // drawn across: the panel minus the price axis recharts reserves.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () =>
      setPlotWidth(Math.max(0, frame.clientWidth - VALUE_AXIS_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Identifies the series by what it covers, so a different range with the
  // same number of bars still counts as a new chart. Keyed on the real
  // `data` prop rather than `plottedData`: the coverage query that supplies
  // `gaps` resolves on its own schedule, after `data` has often already
  // rendered, and keying on the slotted length would reset the reader's pan
  // and zoom the moment those slots appeared.
  const seriesKey = `${data.length}:${data[0]?.date ?? ""}:${
    data[data.length - 1]?.date ?? ""
  }`;
  // Passed so useChartWindow can re-anchor a stored start index on the real
  // bar's own date when `gaps` resolves late and splices slots into the
  // middle of `plottedData` out from under it (see that hook's own comment).
  const plottedDates = plottedData.map((point) => point.date);
  const chartWindow = useChartWindow(
    plottedData.length,
    plotWidth,
    seriesKey,
    plottedDates,
  );
  const {
    barWidth,
    visibleCount,
    startIndex,
    canScroll,
    atStart,
    atEnd,
    canZoomIn,
    canZoomOut,
    panByPixels,
    zoomBy,
  } = chartWindow;
  const visibleBars = plottedData.slice(startIndex, startIndex + visibleCount);
  // Shared between the price and volume axes: the window's own real bars,
  // or (an all-slot window) the nearest real bars just outside it — see
  // domainBars' own comment.
  //
  // Both axes below also need `allowDataOverflow`, even though the domain
  // is already fixed here: Recharts otherwise ignores an explicit numeric
  // `domain` prop and recomputes one from the visible data regardless, and
  // a window that is every slot has no non-null data to recompute it from
  // — the axis then draws no ticks and no scale for the ReferenceArea band
  // to size itself against, rather than falling back to what's passed here.
  const windowBars = domainBars(plottedData, startIndex, visibleCount);
  const priceDomain = windowDomain(windowBars, mode);
  // One run per gap visible in the current window, for the grey band on
  // both the price and volume panels below.
  const gapBandRuns = gapRuns(visibleBars);
  // Every run across the full series (not just the window), for the
  // screen-reader table further down — that table represents the whole
  // series regardless of pan/zoom, same as it always has.
  const allGapRuns = gapRuns(plottedData);
  const runByStartIndex = new Map(allGapRuns.map((run) => [run.startIndex, run]));

  // Wheel has to be bound here rather than through onWheel: React attaches a
  // passive listener, which cannot preventDefault, so a sideways scroll would
  // navigate back instead of moving the window.
  //
  // Zoom is left to the buttons below. A trackpad pinch arrives as a wheel
  // event with ctrlKey set, but the browser also acts on it as page zoom and
  // does not always let the page win, so handling it here zoomed the whole
  // window as often as the chart.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !canScroll) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      // Only sideways intent pans: a trackpad swipe across, or shift with a
      // wheel that has no horizontal axis. Panning on plain vertical scroll
      // would mean the page could not be scrolled past the chart at all.
      const sideways =
        event.deltaX !== 0
          ? event.deltaX
          : event.shiftKey
            ? event.deltaY
            : 0;
      if (sideways === 0) return;
      // At either end the window cannot move, so let the gesture through
      // rather than swallowing it.
      if ((sideways < 0 && atStart) || (sideways > 0 && atEnd)) return;
      event.preventDefault();
      panByPixels(sideways);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [atEnd, atStart, canScroll, panByPixels]);

  const dragOrigin = useRef<number | null>(null);

  return (
    <div
      ref={frameRef}
      className={`relative h-[332px] w-full min-w-0 max-w-full overflow-hidden sm:h-[372px] ${
        canScroll ? "cursor-ew-resize touch-pan-y" : ""
      }`}
      role="group"
      aria-label={accessibleLabel}
      data-chart-mode={mode}
      data-visible-bars={visibleCount}
      data-bar-width={barWidth}
      data-start-index={startIndex}
      tabIndex={canScroll ? 0 : undefined}
      onKeyDown={
        canScroll
          ? (event) => {
              const step =
                event.key === "PageDown" || event.key === "PageUp"
                  ? visibleCount
                  : 1;
              if (event.key === "ArrowRight" || event.key === "PageDown") {
                event.preventDefault();
                chartWindow.panByBars(step);
              } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
                event.preventDefault();
                chartWindow.panByBars(-step);
              } else if (event.key === "Home") {
                event.preventDefault();
                chartWindow.setStartIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                chartWindow.setStartIndex(plottedData.length);
              } else if (event.key === "+" || event.key === "=") {
                event.preventDefault();
                zoomBy(1.4);
              } else if (event.key === "-") {
                event.preventDefault();
                zoomBy(1 / 1.4);
              }
            }
          : undefined
      }
      onPointerDown={
        canScroll
          ? (event) => {
              dragOrigin.current = event.clientX;
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          : undefined
      }
      onPointerMove={
        canScroll
          ? (event) => {
              if (dragOrigin.current === null) return;
              // Drag right to walk back in time, as on any trading chart.
              panByPixels(dragOrigin.current - event.clientX);
              dragOrigin.current = event.clientX;
            }
          : undefined
      }
      onPointerUp={() => {
        dragOrigin.current = null;
      }}
      onPointerCancel={() => {
        dragOrigin.current = null;
      }}
    >
      <div
        className="h-[230px] w-full min-w-0 max-w-full sm:h-[265px]"
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height="100%">
          {mode === "close" ? (
            <LineChart
              data={visibleBars}
              margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke={chartPalette.grid}
                strokeOpacity={0.35}
              />
              {/* Behind the line: a run of null closes already breaks it, this
                  just paints the stretch it broke across. */}
              <GapBands runs={gapBandRuns} locale={locale} labels={labels} />
              <XAxis
                dataKey="date"
                hide
                scale="band"
                stroke={chartPalette.axis}
              />
              <YAxis
                domain={priceDomain}
                allowDataOverflow
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
                cursor={{ stroke: chartPalette.axis, strokeOpacity: 0.7 }}
                content={
                  <CandlestickTooltip
                    locale={locale}
                    labels={labels}
                    mode={mode}
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
          ) : (
            <BarChart
              data={visibleBars}
              margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke={chartPalette.grid}
                strokeOpacity={0.35}
              />
              <GapBands runs={gapBandRuns} locale={locale} labels={labels} />
              <XAxis dataKey="date" hide stroke={chartPalette.axis} />
              <YAxis
                domain={priceDomain}
                allowDataOverflow
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
                content={
                  <CandlestickTooltip
                    locale={locale}
                    labels={labels}
                    mode={mode}
                  />
                }
              />
              <Bar
                dataKey={candleBody}
                isAnimationActive={false}
                maxBarSize={12}
                minPointSize={2}
              >
                {visibleBars.map((point) => (
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
          )}
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
            data={visibleBars}
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke={chartPalette.grid}
              strokeOpacity={0.3}
            />
            {/* No label here: the price/close panel above already shows it,
                and there is no room to repeat it in this shorter panel. */}
            <GapBands
              runs={gapBandRuns}
              locale={locale}
              labels={labels}
              withLabel={false}
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
              domain={volumeDomain(windowBars)}
              allowDataOverflow
              width={VALUE_AXIS_WIDTH}
              tick={false}
              tickLine={false}
              axisLine={false}
            />
            <Bar dataKey="volume" isAnimationActive={false} maxBarSize={12}>
              {visibleBars.map((point) => (
                <Cell
                  key={`${point.date}-${point.periodEnd ?? ""}-volume`}
                  fill={
                    mode === "close" ? chartPalette.price : candleColor(point)
                  }
                  fillOpacity={0.55}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {(canScroll || visibleCount > 1) && (
        // Zoom lives on buttons rather than a pinch: the browser treats a
        // trackpad pinch as page zoom and does not reliably yield it to the
        // page, so the gesture zoomed the window as often as the chart.
        // Pointer events stop here so pressing a button cannot start a drag.
        <div
          className="absolute right-2 top-2 z-10 flex gap-1"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            disabled={!canZoomOut}
            onClick={() => zoomBy(1 / 1.4)}
            className="flex size-7 items-center justify-center rounded-lg border border-border-button-default bg-background-primary-default text-body-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            &minus;
          </button>
          <button
            type="button"
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            disabled={!canZoomIn}
            onClick={() => zoomBy(1.4)}
            className="flex size-7 items-center justify-center rounded-lg border border-border-button-default bg-background-primary-default text-body-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}

      {canScroll && (
        // A thumb sized to the window's share of the series: without it there
        // is nothing on screen saying the chart holds more than it shows.
        <div
          className="mt-1 ml-[55px] mr-2 h-1 rounded-full bg-background-secondary-default"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-foreground-icon-tertiary/60"
            style={{
              width: `${(visibleCount / plottedData.length) * 100}%`,
              marginLeft: `${(startIndex / plottedData.length) * 100}%`,
            }}
          />
        </div>
      )}

      <table className="sr-only">
        <caption>{accessibleLabel}</caption>
        <thead>
          <tr>
            <th>{labels.date}</th>
            {mode === "candlestick" && <th>{labels.open}</th>}
            <th>{labels.high}</th>
            <th>{labels.low}</th>
            <th>{labels.close}</th>
            {showsAdjustedClose && <th>{labels.adjustedClose}</th>}
            <th>{labels.volume}</th>
          </tr>
        </thead>
        <tbody>
          {plottedData.map((point, index) => {
            // A gap collapses to one row for the whole run rather than one
            // per slot — "Data gap, 1 Jan 2026 to 12 Jun 2026" reads far
            // better to a screen reader than 117 identical empty rows.
            const run = runByStartIndex.get(index);
            if (run) {
              return (
                <tr key={`gap-${run.gap.kind}-${run.gap.from}-${run.gap.to}`}>
                  <th scope="row" colSpan={columnCount}>
                    {gapRowText(run.gap, locale, labels)}
                  </th>
                </tr>
              );
            }
            if (point.gap) return null; // an interior slot of an already-emitted run

            return (
              <tr key={`${point.date}-${point.periodEnd ?? ""}-accessible`}>
                <th>{chartDateLabel(point, locale)}</th>
                {mode === "candlestick" && (
                  <td>{formatNumber(point.open, locale)}</td>
                )}
                <td>{formatNumber(point.high, locale)}</td>
                <td>{formatNumber(point.low, locale)}</td>
                <td>{formatNumber(point.close, locale)}</td>
                {showsAdjustedClose && (
                  <td>
                    {point.adjustedClose === undefined
                      ? "—"
                      : formatNumber(point.adjustedClose, locale)}
                  </td>
                )}
                <td>{formatNumber(point.volume, locale, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

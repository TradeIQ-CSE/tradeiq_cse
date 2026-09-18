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
  windowDomain,
  withCandleComparisons,
} from "./candlestick";
import { chartPalette } from "./chart-theme";
import { useChartWindow } from "./useChartWindow";

interface CandlestickChartProps {
  data: readonly ChartDatum[];
  mode?: "candlestick" | "close";
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
  zoomIn: string;
  zoomOut: string;
}

const DEFAULT_LABELS: CandlestickChartLabels = {
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
  mode,
}: CandlestickTooltipProps & {
  locale: string;
  labels: CandlestickChartLabels;
  mode: "candlestick" | "close";
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg border border-border-table bg-background-primary-default px-3.5 py-2.5 text-caption-1-medium text-text-primary shadow-lg">
      <div className="mb-1 text-text-secondary">
        {chartDateLabel(point, locale)}
      </div>
      {mode === "candlestick" && (
        <div>
          {labels.open}:{" "}
          {point.open === null ? "—" : formatNumber(point.open, locale)}
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
  mode = "candlestick",
  locale = "en-US",
  accessibleLabel = "OHLCV price and volume chart",
  labels: labelOverrides,
}: CandlestickChartProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  // The CSE source can provide a period high/low/close while leaving open
  // unavailable. Keep the missing open intact for geometry and disclosure,
  // but compare close with the previous period's close so direction colour
  // remains meaningful. A real open always wins when the API provides one.
  const plottedData = withCandleComparisons(data);
  const showsAdjustedClose = data.some(
    (point) => point.adjustedClose !== undefined,
  );
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

  const chartWindow = useChartWindow(plottedData.length, plotWidth);
  const {
    barWidth,
    visibleCount,
    startIndex,
    canScroll,
    canZoomIn,
    canZoomOut,
    panByPixels,
    zoomBy,
  } = chartWindow;
  const visibleBars = plottedData.slice(startIndex, startIndex + visibleCount);
  const priceDomain = windowDomain(visibleBars, mode);

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
      const sideways =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (sideways === 0) return;
      event.preventDefault();
      panByPixels(sideways);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [canScroll, panByPixels]);

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
              <XAxis
                dataKey="date"
                hide
                scale="band"
                stroke={chartPalette.axis}
              />
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
          {data.map((point) => (
            <tr key={`${point.date}-${point.periodEnd ?? ""}-accessible`}>
              <th>{chartDateLabel(point, locale)}</th>
              {mode === "candlestick" && (
                <td>
                  {point.open === null ? "—" : formatNumber(point.open, locale)}
                </td>
              )}
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

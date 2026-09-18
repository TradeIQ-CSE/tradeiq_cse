import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VISIBLE_BARS,
  MIN_BAR_WIDTH,
  barWidthFor,
  clampStartIndex,
  visibleCountFor,
} from "./candlestick";

/**
 * Pan and zoom over a bar series. The chart canvas keeps the panel's width and
 * a window of bars moves across it, rather than the canvas growing and being
 * scrolled: that keeps the price axis in view and keeps the price and volume
 * panels aligned, both of which a scrolling canvas would break.
 *
 * Zoom is held as the number of bars the reader wants on screen, not as a bar
 * width in pixels. The width is derived, so the window is correct on the first
 * paint — before the panel has been measured — and survives a resize.
 */
export function useChartWindow(total: number, plotWidth: number) {
  const [targetVisible, setTargetVisible] = useState(DEFAULT_VISIBLE_BARS);
  const [start, setStart] = useState(Number.MAX_SAFE_INTEGER);
  // Panning is expressed in bars, but a gesture arrives in pixels; the
  // remainder carries between events so slow drags aren't swallowed.
  const carriedPixels = useRef(0);

  const barWidth = barWidthFor(plotWidth, targetVisible);
  const visibleCount = visibleCountFor(plotWidth, barWidth, total);
  const startIndex = clampStartIndex(start, visibleCount, total);
  const canScroll = total > visibleCount;
  /** Zooming out stops here, which is what keeps candles above a usable width. */
  const maxVisible = Math.max(
    1,
    Math.floor(Math.max(plotWidth, MIN_BAR_WIDTH) / MIN_BAR_WIDTH),
  );

  // A new series (symbol, timeframe or range) is a new chart: open it on the
  // most recent bars at the default zoom instead of keeping the old window.
  useEffect(() => {
    setTargetVisible(DEFAULT_VISIBLE_BARS);
    setStart(Number.MAX_SAFE_INTEGER);
    carriedPixels.current = 0;
  }, [total]);

  const panByBars = useCallback(
    (bars: number) => {
      setStart(clampStartIndex(startIndex + bars, visibleCount, total));
    },
    [startIndex, total, visibleCount],
  );

  const panByPixels = useCallback(
    (pixels: number) => {
      const carried = carriedPixels.current + pixels;
      const bars = Math.trunc(carried / barWidth);
      carriedPixels.current = carried - bars * barWidth;
      if (bars !== 0) panByBars(bars);
    },
    [barWidth, panByBars],
  );

  /**
   * Zoom about a point in the panel, so the bar under the cursor or the pinch
   * stays roughly put. `factor` above 1 zooms in, showing fewer bars.
   */
  const zoomBy = useCallback(
    (factor: number, anchorRatio = 0.5) => {
      const next = Math.min(
        maxVisible,
        Math.max(1, Math.round(targetVisible / factor)),
      );
      if (next === visibleCount) return;
      setTargetVisible(next);
      const anchorBar = Math.round(visibleCount * anchorRatio);
      setStart(
        clampStartIndex(
          startIndex + anchorBar - Math.round(next * anchorRatio),
          next,
          total,
        ),
      );
    },
    [maxVisible, startIndex, targetVisible, total, visibleCount],
  );

  return {
    barWidth,
    visibleCount,
    startIndex,
    canScroll,
    atStart: startIndex === 0,
    atEnd: startIndex >= total - visibleCount,
    panByBars,
    panByPixels,
    zoomBy,
    setStartIndex: (next: number) =>
      setStart(clampStartIndex(next, visibleCount, total)),
  };
}

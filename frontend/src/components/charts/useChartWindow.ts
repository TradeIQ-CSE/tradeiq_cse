import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VISIBLE_BARS,
  MAX_BAR_WIDTH,
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
 *
 * `dates` is the plotted series' own dates, in the same order as `total`
 * counts — see the effect below for why a bar's identity, not its raw
 * index, is what a late-arriving change to the series has to preserve.
 */
export function useChartWindow(
  total: number,
  plotWidth: number,
  seriesKey: string,
  dates: readonly string[] = [],
) {
  const [targetVisible, setTargetVisible] = useState(DEFAULT_VISIBLE_BARS);
  const [start, setStart] = useState(Number.MAX_SAFE_INTEGER);
  // Panning is expressed in bars, but a gesture arrives in pixels; the
  // remainder carries between events so slow drags aren't swallowed.
  const carriedPixels = useRef(0);
  // What `start` was last resolved against, so a later change to `dates`
  // (see the effect below) can look up the date the reader was actually
  // looking at rather than just its old numeric position.
  const previousRef = useRef({ seriesKey, dates, start });

  const barWidth = barWidthFor(plotWidth, targetVisible);
  // Before the panel has been measured there is no width to divide, so honour
  // the requested count as-is rather than pinning the window to its default.
  const visibleCount =
    plotWidth > 0
      ? visibleCountFor(plotWidth, barWidth, total)
      : Math.min(total, targetVisible);
  const startIndex = clampStartIndex(start, visibleCount, total);
  const canScroll = total > visibleCount;
  /** Zooming out stops here, which is what keeps candles above a usable width. */
  const maxVisible =
    plotWidth > 0 ? Math.max(1, Math.floor(plotWidth / MIN_BAR_WIDTH)) : total;
  /**
   * Zooming in stops here. Asking for fewer bars than this would need candles
   * wider than the maximum, so the extra width is refused and the count stops
   * falling — leaving the requested count below the count actually drawn, from
   * where a zoom out could not climb back.
   */
  const minVisible =
    plotWidth > 0 ? Math.max(1, Math.ceil(plotWidth / MAX_BAR_WIDTH)) : 1;

  // A new series (timeframe or range) is a new chart: open it on the most
  // recent bars at the default zoom instead of keeping the old window. Keyed
  // on what the series covers rather than how many bars it holds, because two
  // different ranges can hold the same count and would otherwise inherit the
  // previous pan and zoom. `seriesKey` deliberately ignores gaps (see
  // CandlestickChart), so this branch never fires just because the coverage
  // query resolved — that case is the one below instead.
  //
  // `gaps` arrives from its own query and can resolve well after the reader
  // has already panned, zoomed, or pressed Home/End on the ungapped series.
  // `withGapSlots` then splices placeholder bars into the middle of
  // `plottedData`, which grows `total` and shifts every real bar after the
  // first slot to a higher index — but a `start` already stored as a plain
  // number does not know that, and would go on pointing at whatever now
  // happens to sit at that offset, silently dragging the window into (or
  // past) the new grey band. Re-resolving `start` by the bar's own date
  // instead keeps the reader looking at the same bar they left on. The
  // untouched default window (`start` still the MAX_SAFE_INTEGER sentinel,
  // "show the latest bars") needs no re-resolving: `clampStartIndex` already
  // recomputes it against the current `total` on every render.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { seriesKey, dates, start };

    if (seriesKey !== previous.seriesKey) {
      setTargetVisible(DEFAULT_VISIBLE_BARS);
      setStart(Number.MAX_SAFE_INTEGER);
      carriedPixels.current = 0;
      return;
    }

    if (dates === previous.dates || previous.start === Number.MAX_SAFE_INTEGER) {
      return;
    }
    const anchorDate = previous.dates[previous.start];
    if (anchorDate === undefined) return;
    const resolved = dates.indexOf(anchorDate);
    if (resolved !== -1 && resolved !== previous.start) setStart(resolved);
  }, [seriesKey, dates, start]);

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
      // Rounding alone stalls at small counts: one bar times 1.4 rounds back
      // to one, so every press after a full zoom in did nothing. Each press
      // moves by at least one bar.
      const rounded = Math.round(targetVisible / factor);
      const stepped =
        factor > 1
          ? Math.min(rounded, targetVisible - 1)
          : Math.max(rounded, targetVisible + 1);
      const next = Math.min(maxVisible, Math.max(minVisible, stepped));
      if (next === targetVisible) return;
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
    [maxVisible, minVisible, startIndex, targetVisible, total, visibleCount],
  );

  return {
    barWidth,
    visibleCount,
    // A zoom that cannot change anything should look unavailable rather than
    // silently do nothing: in is capped by one bar, out by the whole series
    // fitting or by the candles reaching their minimum width.
    canZoomIn: visibleCount > minVisible,
    canZoomOut: visibleCount < Math.min(total, maxVisible),
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

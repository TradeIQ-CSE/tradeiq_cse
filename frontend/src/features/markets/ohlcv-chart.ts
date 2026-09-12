import { ChartDatum } from "../../components/charts/candlestick";
import {
  AggregateOhlcvBar,
  DailyOhlcvBar,
  OhlcvResponse,
  OhlcvTimeframe,
} from "./types";

export type PriceChartMode = "candlestick" | "close";

export function isDailyBar(
  bar: DailyOhlcvBar | AggregateOhlcvBar,
): bar is DailyOhlcvBar {
  return "date" in bar;
}

/** Preserve the API's inclusive ascending order; charting must not re-sort it. */
export function normalizeOhlcvBars(response: OhlcvResponse): ChartDatum[] {
  return response.bars.map((bar) => {
    if (isDailyBar(bar)) {
      return {
        date: bar.date,
        periodEnd: null,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        adjustedClose: bar.adjusted_close,
        volume: bar.volume,
      };
    }

    return {
      date: bar.period_start,
      periodEnd: bar.period_end,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    };
  });
}

/**
 * A standard candle requires a meaningful open-to-close body. Some historical
 * daily sources expose the session range and close but repeat close as open for
 * every row. Showing those rows as a year of doji candles implies OHLC fidelity
 * the source does not have, so use an explicitly labelled close-price view.
 * Aggregated weekly/monthly bars remain standard candles.
 */
export function priceChartMode(
  timeframe: OhlcvTimeframe,
  data: readonly ChartDatum[],
): PriceChartMode {
  // A short run of doji candles can be completely legitimate. Only infer a
  // source limitation once there are enough sessions to establish a pattern.
  if (timeframe !== "daily" || data.length < 10) return "candlestick";

  const meaningfulBodies = data.filter(
    (point) => point.open !== null && point.open !== point.close,
  ).length;

  // Keep candles unless at least 95% of the selected sessions lack a usable
  // body. This catches close-only historical feeds without misclassifying an
  // occasional genuine doji or a quiet short range.
  return meaningfulBodies / data.length <= 0.05 ? "close" : "candlestick";
}

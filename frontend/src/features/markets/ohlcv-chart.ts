import { ChartDatum } from '../../components/charts/candlestick';
import {
  AggregateOhlcvBar,
  DailyOhlcvBar,
  OhlcvResponse,
} from './types';

export function isDailyBar(
  bar: DailyOhlcvBar | AggregateOhlcvBar,
): bar is DailyOhlcvBar {
  return 'date' in bar;
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

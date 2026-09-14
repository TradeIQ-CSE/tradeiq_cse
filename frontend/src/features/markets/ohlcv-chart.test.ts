import { describe, expect, it } from "vitest";
import {
  dailyOhlcvFixture,
  weeklyOhlcvFixture,
} from "../../test/fixtures/security-detail";
import { normalizeOhlcvBars, priceChartMode } from "./ohlcv-chart";

describe("normalizeOhlcvBars", () => {
  it("preserves daily order, values, adjusted close, and nullable open", () => {
    const result = normalizeOhlcvBars(dailyOhlcvFixture);

    expect(result.map((bar) => bar.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(result[0]).toEqual({
      date: "2026-09-01",
      periodEnd: null,
      open: null,
      high: 199,
      low: 194,
      close: 196.25,
      adjustedClose: null,
      volume: 300_500,
    });
    expect(result[1].adjustedClose).toBe(198.25);
  });

  it("maps aggregate period labels without inventing adjusted closes", () => {
    const [result] = normalizeOhlcvBars(weeklyOhlcvFixture);

    expect(result.date).toBe("2026-08-24");
    expect(result.periodEnd).toBe("2026-08-28");
    expect(result).not.toHaveProperty("adjustedClose");
    expect(result).toMatchObject({
      open: 190,
      high: 198,
      low: 189,
      close: 196,
      volume: 2_500_000,
    });
  });
});

describe("priceChartMode", () => {
  const closeOnly = Array.from({ length: 20 }, (_, index) => ({
    date: `2025-01-${String(index + 1).padStart(2, "0")}`,
    open: 26 + index,
    high: 27 + index,
    low: 25 + index,
    close: 26 + index,
    volume: 27_296 + index,
  }));

  it("uses a close-price view when daily rows cannot form candle bodies", () => {
    expect(priceChartMode("daily", closeOnly)).toBe("close");
  });

  it("keeps standard daily candles when at least one real body exists", () => {
    expect(
      priceChartMode("daily", [
        ...closeOnly,
        { ...closeOnly[1], date: "2025-02-01", open: 25.5 },
        { ...closeOnly[2], date: "2025-02-02", open: 25.5 },
      ]),
    ).toBe("candlestick");
  });

  it("does not mistake a short run of genuine doji candles for deficient data", () => {
    expect(priceChartMode("daily", closeOnly.slice(0, 5))).toBe("candlestick");
  });

  it.each(["weekly", "monthly"] as const)(
    "keeps %s data as standard candles",
    (timeframe) => {
      expect(priceChartMode(timeframe, closeOnly)).toBe("candlestick");
    },
  );
});

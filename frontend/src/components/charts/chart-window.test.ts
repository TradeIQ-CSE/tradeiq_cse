import { describe, expect, it } from "vitest";
import {
  ChartDatum,
  DEFAULT_VISIBLE_BARS,
  MAX_BAR_WIDTH,
  MIN_BAR_WIDTH,
  barWidthFor,
  clampStartIndex,
  defaultStartIndex,
  visibleCountFor,
  windowDomain,
} from "./candlestick";

const bar = (close: number, extra: Partial<ChartDatum> = {}): ChartDatum => ({
  date: "2025-01-02",
  open: close - 1,
  high: close + 2,
  low: close - 2,
  close,
  volume: 100,
  ...extra,
});

describe("barWidthFor", () => {
  it("fits the requested count when that lands inside the allowed range", () => {
    expect(barWidthFor(300, 15)).toBe(20);
  });

  it("never goes below the minimum, which is what stops hairline candles", () => {
    // 600 bars in a 900px panel would be 1.5px each without the floor.
    expect(barWidthFor(900, 600)).toBe(MIN_BAR_WIDTH);
  });

  it("never exceeds the maximum, so a two-bar range is not drawn as slabs", () => {
    expect(barWidthFor(900, 2)).toBe(MAX_BAR_WIDTH);
  });
});

describe("visibleCountFor", () => {
  it("counts how many whole bars fit at the given width", () => {
    expect(visibleCountFor(300, 20, 500)).toBe(15);
  });

  it("caps at the minimum bar width however far the user zooms out", () => {
    // A 1px request must still be treated as MIN_BAR_WIDTH.
    expect(visibleCountFor(160, 1, 500)).toBe(160 / MIN_BAR_WIDTH);
  });

  it("never claims more bars than the series holds", () => {
    expect(visibleCountFor(900, MIN_BAR_WIDTH, 12)).toBe(12);
  });

  it("always shows at least one bar in a narrow panel", () => {
    expect(visibleCountFor(4, MIN_BAR_WIDTH, 30)).toBe(1);
  });

  it("returns nothing for an empty series", () => {
    expect(visibleCountFor(900, MIN_BAR_WIDTH, 0)).toBe(0);
  });
});

describe("clampStartIndex", () => {
  it("stops at the last full window rather than panning past the end", () => {
    expect(clampStartIndex(999, 15, 100)).toBe(85);
  });

  it("stops at the first bar rather than panning before the start", () => {
    expect(clampStartIndex(-40, 15, 100)).toBe(0);
  });

  it("pins to zero when the whole series fits", () => {
    expect(clampStartIndex(5, 30, 10)).toBe(0);
  });
});

describe("defaultStartIndex", () => {
  it("opens on the most recent bars", () => {
    expect(defaultStartIndex(DEFAULT_VISIBLE_BARS, 100)).toBe(85);
  });

  it("shows a short series whole", () => {
    expect(defaultStartIndex(DEFAULT_VISIBLE_BARS, 9)).toBe(0);
  });
});

describe("windowDomain", () => {
  it("scales to the bars on screen, not the whole series", () => {
    const [low, high] = windowDomain([bar(100), bar(110)], "candlestick");
    // lows 98..108, highs 102..112; 5% of that 14-point span is below the
    // one-unit floor, so the padding is 1.
    expect(low).toBeCloseTo(97, 5);
    expect(high).toBeCloseTo(113, 5);
  });

  it("uses closes only in close mode", () => {
    const [low, high] = windowDomain([bar(100), bar(110)], "close");
    expect(low).toBeCloseTo(100 - 1, 5);
    expect(high).toBeCloseTo(110 + 1, 5);
  });

  it("falls back to a unit domain with no bars", () => {
    expect(windowDomain([], "candlestick")).toEqual([0, 1]);
  });
});

describe("the default window", () => {
  it("shows exactly 15 bars at the panel widths this chart actually gets", () => {
    for (const plotWidth of [360, 577, 618, 733, 900, 1024, 1080]) {
      const width = barWidthFor(plotWidth, DEFAULT_VISIBLE_BARS);
      expect(visibleCountFor(plotWidth, width, 500)).toBe(DEFAULT_VISIBLE_BARS);
    }
  });

  it("shows more than 15 on a panel too wide for the maximum candle width", () => {
    const plotWidth = 2000;
    const width = barWidthFor(plotWidth, DEFAULT_VISIBLE_BARS);
    expect(width).toBe(MAX_BAR_WIDTH);
    expect(visibleCountFor(plotWidth, width, 500)).toBeGreaterThan(
      DEFAULT_VISIBLE_BARS,
    );
  });
});

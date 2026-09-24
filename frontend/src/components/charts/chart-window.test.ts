import { describe, expect, it } from "vitest";
import {
  ChartDatum,
  DEFAULT_VISIBLE_BARS,
  MAX_BAR_WIDTH,
  MIN_BAR_WIDTH,
  barWidthFor,
  clampStartIndex,
  defaultStartIndex,
  domainBars,
  isRealBar,
  visibleCountFor,
  volumeDomain,
  windowDomain,
} from "./candlestick";
import { DataGap } from "../../lib/data-gaps";

const bar = (close: number, extra: Partial<ChartDatum> = {}): ChartDatum => ({
  date: "2025-01-02",
  open: close - 1,
  high: close + 2,
  low: close - 2,
  close,
  volume: 100,
  ...extra,
});

const missingData: DataGap = {
  from: "2026-01-06",
  to: "2026-01-07",
  sessions: 2,
  kind: "missing_data",
};

const slot = (date: string): ChartDatum => ({
  date,
  open: null,
  high: null,
  low: null,
  close: null,
  volume: null,
  gap: missingData,
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

  it("ignores gap slots mixed in with real bars", () => {
    const withSlot = [bar(100), slot("2026-01-06"), bar(110)];
    expect(windowDomain(withSlot, "candlestick")).toEqual(
      windowDomain([bar(100), bar(110)], "candlestick"),
    );
  });

  it("falls back to a unit domain when every bar on screen is a gap slot", () => {
    expect(windowDomain([slot("2026-01-06"), slot("2026-01-07")], "candlestick")).toEqual(
      [0, 1],
    );
  });
});

describe("isRealBar", () => {
  it("is true for an ordinary bar and false for a gap slot", () => {
    expect(isRealBar(bar(100))).toBe(true);
    expect(isRealBar(slot("2026-01-06"))).toBe(false);
  });
});

describe("domainBars", () => {
  it("returns the window's own real bars when it has any", () => {
    const all = [bar(90), bar(100), slot("2026-01-06"), bar(110)];
    expect(domainBars(all, 1, 2)).toEqual([bar(100)]);
  });

  it("reaches outside the window for the nearest real bar on each side when the whole window is a gap", () => {
    const all = [
      bar(90, { date: "2026-01-02" }),
      slot("2026-01-06"),
      slot("2026-01-07"),
      bar(110, { date: "2026-01-12" }),
    ];
    // The window (indexes 1..2) is entirely slots: the axis should still
    // price itself from the bars just outside it, so it never collapses to
    // windowDomain's [0, 1] fallback.
    expect(domainBars(all, 1, 2)).toEqual([
      bar(90, { date: "2026-01-02" }),
      bar(110, { date: "2026-01-12" }),
    ]);
  });

  it("uses whichever side has a real bar when the gap sits at one edge of the series", () => {
    const all = [slot("2026-01-06"), slot("2026-01-07"), bar(110, { date: "2026-01-12" })];
    expect(domainBars(all, 0, 2)).toEqual([bar(110, { date: "2026-01-12" })]);
  });
});

describe("volumeDomain", () => {
  it("starts at 0 and tops out at the highest real volume", () => {
    expect(volumeDomain([bar(100, { volume: 500 }), bar(110, { volume: 900 })])).toEqual([
      0, 900,
    ]);
  });

  it("ignores gap slots mixed in with real bars", () => {
    expect(
      volumeDomain([bar(100, { volume: 500 }), slot("2026-01-06"), bar(110, { volume: 900 })]),
    ).toEqual([0, 900]);
  });

  it("falls back to a unit domain with no bars", () => {
    expect(volumeDomain([])).toEqual([0, 1]);
  });

  it("falls back to a unit domain when every bar is a gap slot", () => {
    expect(volumeDomain([slot("2026-01-06"), slot("2026-01-07")])).toEqual([0, 1]);
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

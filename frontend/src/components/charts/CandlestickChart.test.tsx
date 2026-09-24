import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  candleBody,
  candleColor,
  candleGeometryOpen,
  candleWick,
  ChartDatum,
  chartDateLabel,
  withCandleComparisons,
  DEFAULT_VISIBLE_BARS,
} from "./candlestick";
import { chartPalette } from "./chart-theme";
import { CandlestickChart, CandlestickTooltip, DEFAULT_LABELS } from "./CandlestickChart";
import { DataGap } from "../../lib/data-gaps";

const missingDataGap: DataGap = {
  from: "2026-01-06",
  to: "2026-01-07",
  sessions: 2,
  kind: "missing_data",
};

function gapSlot(date: string, gap: DataGap = missingDataGap): ChartDatum {
  return {
    date,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    gap,
  };
}

// Asserting against palette fields rather than literal colours: these are
// now CSS custom properties that follow the theme, and what this suite
// protects is which branch a candle takes, not what the green resolves to.

function point(overrides: Partial<ChartDatum>): ChartDatum {
  return {
    date: "2026-01-05",
    open: 100,
    high: 110,
    low: 90,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("candleBody", () => {
  it("spans [open, close] when open is below close", () => {
    expect(candleBody(point({ open: 100, close: 108 }))).toEqual([100, 108]);
  });

  it("spans [close, open] when close is below open", () => {
    expect(candleBody(point({ open: 108, close: 100 }))).toEqual([100, 108]);
  });

  it("uses close only as neutral geometry when open is unavailable", () => {
    const p = point({ open: null, close: 104 });
    expect(candleGeometryOpen(p)).toBe(104);
    expect(candleBody(p)).toEqual([104, 104]);
    expect(candleColor(p)).toBe(chartPalette.neutral);
    expect(p.open).toBeNull();
  });

  it("returns null for a gap slot rather than a zero-width range", () => {
    const slot = gapSlot("2026-01-06");
    expect(candleGeometryOpen(slot)).toBeNull();
    expect(candleBody(slot)).toBeNull();
    expect(candleColor(slot)).toBe(chartPalette.neutral);
  });
});

describe("candleWick", () => {
  it("splits into the segment below and above the body", () => {
    // body high = max(open, close) = 108; low = 90, high = 115
    const p = point({ open: 100, close: 108, low: 90, high: 115 });
    expect(candleWick(p)).toEqual([108 - 90, 115 - 108]);
  });

  it("uses the body high from a bearish candle too", () => {
    // body high = max(open, close) = 108 (open here); low = 95, high = 112
    const p = point({ open: 108, close: 101, low: 95, high: 112 });
    expect(candleWick(p)).toEqual([108 - 95, 112 - 108]);
  });

  it("returns null for a gap slot", () => {
    expect(candleWick(gapSlot("2026-01-06"))).toBeNull();
  });
});

describe("candleColor", () => {
  it("is the up colour when close is above open", () => {
    expect(candleColor(point({ open: 100, close: 105 }))).toBe(chartPalette.up);
  });

  it("is the down colour when close is below open", () => {
    expect(candleColor(point({ open: 105, close: 100 }))).toBe(
      chartPalette.down,
    );
  });

  it("is the flat colour when close equals open", () => {
    expect(candleColor(point({ open: 100, close: 100 }))).toBe(
      chartPalette.neutral,
    );
  });

  it("uses the previous close for colour only when open is unavailable", () => {
    expect(
      candleColor(point({ open: null, comparisonClose: 100, close: 105 })),
    ).toBe(chartPalette.up);
    expect(
      candleColor(point({ open: null, comparisonClose: 105, close: 100 })),
    ).toBe(chartPalette.down);
  });

  it("keeps the first missing-open period neutral without a comparison", () => {
    expect(
      candleColor(point({ open: null, comparisonClose: null, close: 105 })),
    ).toBe(chartPalette.neutral);
  });
});

describe("withCandleComparisons", () => {
  it("preserves missing opens and compares each period with the prior close", () => {
    const result = withCandleComparisons([
      point({ date: "2026-01-05", open: null, close: 100 }),
      point({ date: "2026-01-06", open: null, close: 105 }),
      point({ date: "2026-01-07", open: null, close: 99 }),
    ]);

    expect(result.map(({ open }) => open)).toEqual([null, null, null]);
    expect(result.map(({ comparisonClose }) => comparisonClose)).toEqual([
      null,
      100,
      105,
    ]);
    expect(result.map(candleColor)).toEqual([
      chartPalette.neutral,
      chartPalette.up,
      chartPalette.down,
    ]);
  });

  it("skips gap slots: the first real bar after a gap compares against the last real close before it", () => {
    const result = withCandleComparisons([
      point({ date: "2026-01-05", open: 100, close: 100 }),
      gapSlot("2026-01-06"),
      gapSlot("2026-01-07"),
      point({ date: "2026-01-08", open: 105, close: 105 }),
    ]);

    expect(result.map(({ comparisonClose }) => comparisonClose)).toEqual([
      null,
      100,
      100,
      100,
    ]);
  });
});

describe("chartDateLabel", () => {
  it("shows a single date for daily bars and the full period for aggregates", () => {
    expect(chartDateLabel(point({ date: "2026-08-24" }), "en-US")).toBe(
      "Aug 24, 2026",
    );
    expect(
      chartDateLabel(
        point({ date: "2026-08-24", periodEnd: "2026-08-28" }),
        "en-US",
      ),
    ).toBe("Aug 24, 2026 – Aug 28, 2026");
  });

  it("shows one date for an aggregate period that covers a single day", () => {
    expect(
      chartDateLabel(
        point({ date: "2026-08-24", periodEnd: "2026-08-24" }),
        "en-US",
      ),
    ).toBe("Aug 24, 2026");
  });
});

describe("CandlestickChart", () => {
  it("renders without throwing (smoke only)", () => {
    // jsdom reports zero element size for every node, so recharts'
    // ResponsiveContainer resolves to a 0x0 area and draws no bars/axes.
    // Asserting on rendered chart elements here would be vacuous; this only
    // proves the component mounts and unmounts cleanly.
    const data = [
      point({ date: "2026-01-05", open: 100, high: 110, low: 90, close: 104 }),
      point({ date: "2026-01-06", open: 104, high: 112, low: 101, close: 99 }),
    ];

    const { container } = render(<CandlestickChart data={data} />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it("exposes when it is rendering the close-price fallback", () => {
    const { container } = render(
      <CandlestickChart
        mode="close"
        accessibleLabel="Close-price history"
        data={[point({ close: 104 })]}
      />,
    );

    expect(container.firstChild).toHaveAttribute("data-chart-mode", "close");
    expect(
      within(
        screen.getByRole("table", { name: "Close-price history" }),
      ).queryByRole("columnheader", { name: "Open" }),
    ).not.toBeInTheDocument();
  });

  it("exposes real values, nullable open, adjusted close, and volume accessibly", () => {
    render(
      <CandlestickChart
        locale="en-US"
        accessibleLabel="Daily OHLCV history for JKH.N0000"
        data={[
          point({
            date: "2026-09-01",
            open: null,
            high: 199,
            low: 194,
            close: 196.25,
            adjustedClose: 196.1,
            volume: 300_500,
          }),
        ]}
      />,
    );

    const table = screen.getByRole("table", {
      name: "Daily OHLCV history for JKH.N0000",
    });
    const row = within(table).getByRole("row", { name: /Sep 1, 2026/ });
    expect(row).toHaveTextContent("—");
    expect(row).toHaveTextContent("196.10");
    expect(row).toHaveTextContent("300,500");
  });

  it("does not expose adjusted close for aggregate-only data", () => {
    render(
      <CandlestickChart
        accessibleLabel="Weekly OHLCV history"
        data={[point({ date: "2026-08-24", periodEnd: "2026-08-28" })]}
      />,
    );

    const table = screen.getByRole("table", { name: "Weekly OHLCV history" });
    expect(
      within(table).queryByRole("columnheader", { name: "Adjusted close" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["monthly", 1],
    ["weekly", 2],
    ["short daily range", 7],
    ["long daily range", 31],
  ])(
    "keeps every volume bar centered under its candle for a %s data set",
    async (_range, count) => {
      const bounds = {
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 400,
        left: 0,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      } as DOMRect;
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
        bounds,
      );
      const data = Array.from({ length: count }, (_, index) =>
        point({
          date: `2026-01-${String(index + 1).padStart(2, "0")}`,
          periodEnd: count <= 2 ? "2026-01-31" : undefined,
          close: 100 + (index % 3),
          volume: 1_000 + index * 100,
        }),
      );

      const { container } = render(<CandlestickChart data={data} />);

      await waitFor(() => {
        expect(container.querySelectorAll(".recharts-wrapper")).toHaveLength(2);
      });

      const centers = Array.from(
        container.querySelectorAll(".recharts-wrapper"),
      ).map((chart) =>
        Array.from(
          chart.querySelectorAll<SVGPathElement>(
            ".recharts-bar-rectangle path",
          ),
        ).map((bar) => {
          const x = Number(bar.getAttribute("d")?.match(/^M\s+([\d.]+)/)?.[1]);
          const width = Number(bar.getAttribute("width"));
          return x + width / 2;
        }),
      );

      // The chart draws a window rather than the whole series. jsdom reports
      // no element width, so the window falls back to its default size.
      const drawn = Math.min(count, DEFAULT_VISIBLE_BARS);
      expect(centers[0]).toHaveLength(drawn);
      expect(centers[1]).toHaveLength(drawn);
      expect(centers[1]).toEqual(centers[0]);
    },
  );
});

describe("zoom controls", () => {
  const series = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      point({
        date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        close: 100 + (index % 5),
        volume: 1_000 + index,
      }),
    );

  it("shows fewer bars when zooming in and more when zooming out", async () => {
    const user = userEvent.setup();
    const { container } = render(<CandlestickChart data={series(60)} />);
    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;
    const shown = () => Number(frame.dataset.visibleBars);

    const opened = shown();
    expect(opened).toBe(DEFAULT_VISIBLE_BARS);

    await user.click(screen.getByRole("button", { name: "Show fewer periods" }));
    expect(shown()).toBeLessThan(opened);

    await user.click(screen.getByRole("button", { name: "Show more periods" }));
    await user.click(screen.getByRole("button", { name: "Show more periods" }));
    expect(shown()).toBeGreaterThan(opened);
  });

  it("disables zooming in once a single bar fills the chart", async () => {
    const user = userEvent.setup();
    const { container } = render(<CandlestickChart data={series(60)} />);
    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;
    const zoomIn = screen.getByRole("button", { name: "Show fewer periods" });

    for (let press = 0; press < 12; press += 1) {
      if ((zoomIn as HTMLButtonElement).disabled) break;
      await user.click(zoomIn);
    }

    expect(Number(frame.dataset.visibleBars)).toBe(1);
    expect(zoomIn).toBeDisabled();
  });

  it("zooms back out after zooming all the way in", async () => {
    const user = userEvent.setup();
    const { container } = render(<CandlestickChart data={series(60)} />);
    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;
    const shown = () => Number(frame.dataset.visibleBars);
    const zoomIn = screen.getByRole("button", { name: "Show fewer periods" });
    const zoomOut = screen.getByRole("button", { name: "Show more periods" });

    for (let press = 0; press < 12; press += 1) {
      if ((zoomIn as HTMLButtonElement).disabled) break;
      await user.click(zoomIn);
    }
    const fullyIn = shown();

    // Rounding used to trap the count here, leaving the button enabled and
    // every press inert.
    expect(zoomOut).toBeEnabled();
    await user.click(zoomOut);
    expect(shown()).toBeGreaterThan(fullyIn);
    await user.click(zoomOut);
    expect(shown()).toBeGreaterThan(fullyIn + 1);
  });
});

describe("window reset and wheel panning", () => {
  const series = (count: number, startDay: number) =>
    Array.from({ length: count }, (_, index) =>
      point({
        date: `2026-0${startDay}-${String((index % 28) + 1).padStart(2, "0")}`,
        close: 100 + (index % 5),
        volume: 1_000 + index,
      }),
    );

  it("returns to the default window when the range changes but the bar count does not", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <CandlestickChart data={series(60, 1)} />,
    );
    const frame = () =>
      container.querySelector<HTMLElement>("[data-chart-mode]")!;

    await user.click(screen.getByRole("button", { name: "Show fewer periods" }));
    const zoomed = Number(frame().dataset.visibleBars);
    expect(zoomed).toBeLessThan(DEFAULT_VISIBLE_BARS);

    // Same number of bars, different days: keyed on the count alone this kept
    // the old zoom and scroll position.
    rerender(<CandlestickChart data={series(60, 2)} />);
    expect(Number(frame().dataset.visibleBars)).toBe(DEFAULT_VISIBLE_BARS);
  });

  it("pans on a sideways wheel and leaves a plain vertical one to the page", () => {
    const { container } = render(<CandlestickChart data={series(60, 1)} />);
    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;
    const start = () => Number(frame.dataset.startIndex);

    const opened = start();
    // fireEvent returns false when the handler called preventDefault.
    const verticalAllowed = fireEvent.wheel(frame, { deltaY: -400 });
    expect(start()).toBe(opened);
    expect(verticalAllowed).toBe(true);

    const sidewaysAllowed = fireEvent.wheel(frame, { deltaX: -400 });
    expect(start()).toBeLessThan(opened);
    expect(sidewaysAllowed).toBe(false);
  });

  it("lets a wheel through once the window reaches the end", () => {
    const { container } = render(<CandlestickChart data={series(60, 1)} />);
    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;

    // Opens on the newest bars, so it is already at the right-hand end.
    expect(fireEvent.wheel(frame, { deltaX: 400 })).toBe(true);
  });

  it("keeps the same real bars in view when gaps resolve after the reader has already pressed End", async () => {
    // `gaps` comes from its own query and can resolve after the reader has
    // moved the window; `seriesKey` deliberately ignores gaps (see the
    // component's own comment) so that alone must not reset it. But
    // withGapSlots splices its slots into the middle of plottedData, which
    // used to leave a plain stored index pointing at whatever now happened
    // to sit at that offset — dragging the view into the new grey band with
    // no action from the reader.
    const bounds = {
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 400,
      left: 0,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(bounds);

    // Real bars for every day in January except the 10th-16th — a real
    // `missing_data` stretch the coverage query only reports once it
    // resolves, same as JKH's own 2026 gap.
    const dayOffsets = Array.from({ length: 40 }, (_, i) => i).filter(
      (i) => i < 9 || i > 15,
    );
    const data = dayOffsets.map((offset, index) =>
      point({
        date: new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000)
          .toISOString()
          .slice(0, 10),
        close: 100 + index,
        volume: 1_000 + index,
      }),
    );

    const { container, rerender } = render(
      <CandlestickChart data={data} gaps={[]} timeframe="daily" />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll(".recharts-wrapper")).toHaveLength(2);
    });

    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;
    frame.focus();
    fireEvent.keyDown(frame, { key: "End" });
    // 33 real bars, 15 visible: End opens on index 18, whose bar is 26 Jan.
    expect(frame.dataset.startIndex).toBe("18");

    // The coverage query resolves: 12-16 Jan (5 weekdays) is a gap, all of
    // it before 26 Jan, so withGapSlots splices 5 slots in ahead of the
    // window. Re-anchoring on 26 Jan's own date — rather than leaving the
    // stored index at a plain 18 — moves the window to 23 with it.
    const gap: DataGap = {
      from: "2026-01-10",
      to: "2026-01-16",
      sessions: 5,
      kind: "missing_data",
    };
    rerender(<CandlestickChart data={data} gaps={[gap]} timeframe="daily" />);

    await waitFor(() => {
      expect(frame.dataset.startIndex).toBe("23");
    });
  });
});

describe("gap slots", () => {
  // A short real bar either side of a 2-weekday gap (Mon 5 – Tue 6 Jan
  // 2026), well under DEFAULT_VISIBLE_BARS so the whole series — real bars
  // and slots — renders in one window with no panning involved.
  const gap: DataGap = {
    from: "2026-01-05",
    to: "2026-01-06",
    sessions: 2,
    kind: "missing_data",
  };
  const realBars = [
    point({ date: "2026-01-02", close: 100 }),
    point({ date: "2026-01-07", close: 108 }),
    point({ date: "2026-01-08", close: 110 }),
  ];

  it("renders without throwing and keeps the chart mode when gaps are passed", () => {
    const { container } = render(
      <CandlestickChart data={realBars} gaps={[gap]} timeframe="daily" />,
    );
    expect(container.firstChild).toHaveAttribute(
      "data-chart-mode",
      "candlestick",
    );
  });

  it("collapses a gap's slots into one screen-reader row instead of one per slot", () => {
    render(
      <CandlestickChart
        data={realBars}
        gaps={[gap]}
        timeframe="daily"
        accessibleLabel="Daily history"
      />,
    );

    const table = screen.getByRole("table", { name: "Daily history" });
    // One summary row for the whole gap ("Data gap, Jan 6, 2026 to Jan 7,
    // 2026") rather than a row per missing weekday.
    expect(
      within(table).getByRole("row", { name: /Data gap, Jan 5, 2026 to Jan 6, 2026/ }),
    ).toBeInTheDocument();
    // And the real bars either side of the gap still get their own rows.
    expect(within(table).getByRole("row", { name: /Jan 2, 2026/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Jan 7, 2026/ })).toBeInTheDocument();
  });

  it("draws a labelled band across a wide-enough gap run", async () => {
    const bounds = {
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 400,
      left: 0,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(bounds);

    const { container } = render(
      <CandlestickChart data={realBars} gaps={[gap]} timeframe="daily" />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".recharts-wrapper")).toHaveLength(2);
    });

    // The band's label reuses the same "Data gap · <range>" text the
    // tooltip shows for a slot (formatGapLabel, lib/data-gaps.ts).
    expect(await screen.findByText("Data gap · Jan 5 – Jan 6, 2026")).toBeInTheDocument();
  });

  it("keeps the axis from collapsing to [0, 1] even when a window lands entirely on a gap", () => {
    // Only the two gap slots and nothing else: windowDomain would fall back
    // to [0, 1] on its own, but the chart's domainBars call reaches outside
    // the (here, whole) window for the nearest real bars — this is really
    // an integration check that CandlestickChart wires domainBars in, the
    // arithmetic itself is covered by chart-window.test.ts.
    const { container } = render(
      <CandlestickChart data={realBars} gaps={[gap]} timeframe="daily" />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("still draws the band, its label and a priced axis when the whole visible window is gap slots", async () => {
    // Reproduces the JKH-daily production bug: a 15-bar window panned into
    // the middle of a gap wide enough that no real bar is on screen at all.
    // Recharts drops an explicit numeric YAxis domain and recomputes one
    // from the (here, entirely null) visible data unless `allowDataOverflow`
    // is set, which used to leave the axis with no ticks and the
    // ReferenceArea with no scale to size itself against — the chart went
    // fully blank but for the x-axis date ticks.
    const bounds = {
      x: 0,
      y: 0,
      top: 0,
      right: 800,
      bottom: 400,
      left: 0,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(bounds);

    const wideGap: DataGap = {
      from: "2026-01-01",
      to: "2026-06-12",
      sessions: 117,
      kind: "missing_data",
    };
    const data = [
      point({ date: "2025-12-31", close: 100 }),
      point({ date: "2026-06-15", close: 108 }),
    ];

    const { container } = render(
      <CandlestickChart data={data} gaps={[wideGap]} timeframe="daily" />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".recharts-wrapper")).toHaveLength(2);
    });

    // Home to the first bar, then one page forward: a whole window's width
    // past the opening real bar, landing entirely inside the gap's 117
    // slots on either side.
    const frame = container.querySelector<HTMLElement>("[data-chart-mode]")!;
    frame.focus();
    fireEvent.keyDown(frame, { key: "Home" });
    fireEvent.keyDown(frame, { key: "PageDown" });
    expect(frame.dataset.startIndex).toBe("15");

    expect(
      await screen.findByText("Data gap · Jan 1 – Jun 12, 2026"),
    ).toBeInTheDocument();
    // One band rect on the price panel, one on the volume panel below it.
    expect(
      container.querySelectorAll(".recharts-reference-area-rect"),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(
        ".recharts-yAxis .recharts-cartesian-axis-tick",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("CandlestickTooltip", () => {
  it("shows the gap label instead of prices when the hovered point is a slot", () => {
    const gap: DataGap = {
      from: "2026-01-05",
      to: "2026-01-06",
      sessions: 2,
      kind: "missing_data",
    };
    const slot = gapSlot("2026-01-05", gap);

    render(
      <CandlestickTooltip
        active
        payload={[{ payload: slot }]}
        locale="en-US"
        labels={DEFAULT_LABELS}
        mode="candlestick"
      />,
    );

    expect(screen.getByText("Data gap · Jan 5 – Jan 6, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/High:/)).not.toBeInTheDocument();
  });

  it("labels a market_closed slot as Market closed", () => {
    const closure: DataGap = {
      from: "2020-03-23",
      to: "2020-05-08",
      sessions: 33,
      kind: "market_closed",
      label: "CSE closed (COVID-19)",
    };
    const slot = gapSlot("2020-03-23", closure);

    render(
      <CandlestickTooltip
        active
        payload={[{ payload: slot }]}
        locale="en-US"
        labels={DEFAULT_LABELS}
        mode="candlestick"
      />,
    );

    expect(
      screen.getByText("Market closed · Mar 23 – May 8, 2020"),
    ).toBeInTheDocument();
  });

  it("shows prices as usual for a real bar", () => {
    render(
      <CandlestickTooltip
        active
        payload={[{ payload: point({ close: 108 }) }]}
        locale="en-US"
        labels={DEFAULT_LABELS}
        mode="candlestick"
      />,
    );

    expect(screen.getByText(/Close:/)).toBeInTheDocument();
    expect(screen.queryByText(/Data gap/)).not.toBeInTheDocument();
  });
});

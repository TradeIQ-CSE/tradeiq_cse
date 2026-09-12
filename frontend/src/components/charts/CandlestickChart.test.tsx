import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import {
  candleBody,
  candleColor,
  candleGeometryOpen,
  candleWick,
  ChartDatum,
  chartDateLabel,
} from "./candlestick";
import { chartPalette } from "./chart-theme";
import { CandlestickChart } from "./CandlestickChart";

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

      expect(centers[0]).toHaveLength(count);
      expect(centers[1]).toHaveLength(count);
      expect(centers[1]).toEqual(centers[0]);
    },
  );
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import {
  IndexChartPoint,
  IndexChartTooltip,
  IndexLineChart,
} from "./IndexLineChart";
import { DataGap } from "../../lib/data-gaps";
import { DEFAULT_GAP_LABELS } from "./gap-band";

const gap: DataGap = {
  from: "2026-01-05",
  to: "2026-01-06",
  sessions: 2,
  kind: "missing_data",
};

const realPoints: IndexChartPoint[] = [
  { date: "2026-01-02", close: 15000 },
  { date: "2026-01-07", close: 15200 },
  { date: "2026-01-08", close: 15250 },
];

describe("IndexLineChart", () => {
  it("renders without throwing (smoke only)", () => {
    // jsdom reports zero element size, so ResponsiveContainer resolves to a
    // 0x0 area and draws no line/axes — this only proves a clean mount.
    const { container } = render(
      <IndexLineChart data={[{ date: "2026-01-02", close: 15000 }]} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders a normal chart with no gaps prop (unchanged behaviour)", () => {
    render(
      <IndexLineChart
        data={realPoints}
        accessibleLabel="ASPI history"
      />,
    );
    const table = screen.getByRole("table", { name: "ASPI history" });
    // One row per real point, nothing collapsed, no gap rows.
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3
  });

  it("collapses a gap's slots into one screen-reader row instead of one per slot", () => {
    render(
      <IndexLineChart
        data={realPoints}
        gaps={[gap]}
        timeframe="daily"
        accessibleLabel="ASPI history"
      />,
    );

    const table = screen.getByRole("table", { name: "ASPI history" });
    expect(
      within(table).getByRole("row", {
        name: /No data, Jan 5, 2026 to Jan 6, 2026/,
      }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Jan 2, 2026/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Jan 7, 2026/ })).toBeInTheDocument();
    // Header + 3 real rows + 1 gap summary row, never a row per slot.
    expect(within(table).getAllByRole("row")).toHaveLength(5);
  });

  it("never pads a gap outside its own first/last point", () => {
    // The series only reaches into the middle of the gap, so nothing should
    // be slotted at all — same rule withGapSlots enforces on its own.
    render(
      <IndexLineChart
        data={[
          { date: "2026-01-06", close: 15000 },
          { date: "2026-02-01", close: 15300 },
        ]}
        gaps={[gap]}
        timeframe="daily"
        accessibleLabel="ASPI history"
      />,
    );
    const table = screen.getByRole("table", { name: "ASPI history" });
    expect(within(table).queryByText(/No data/)).not.toBeInTheDocument();
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

    render(<IndexLineChart data={realPoints} gaps={[gap]} timeframe="daily" />);

    await waitFor(() => {
      expect(document.querySelectorAll(".recharts-wrapper")).toHaveLength(1);
    });

    expect(
      await screen.findByText("No data · Jan 5 – Jan 6, 2026"),
    ).toBeInTheDocument();
  });

  it("keeps a priced axis even if the whole series were gap slots", async () => {
    // This chart always plots its whole series rather than a pan/zoom
    // window, so `withGapSlots` can never produce an all-slot result on its
    // own (the real bars either side of a gap are always kept) — but the
    // same Recharts gotcha CandlestickChart hit (an explicit numeric
    // `domain` is ignored, and one gets recomputed from data, unless
    // `allowDataOverflow` is set) would bite here too if a caller ever did
    // pass an all-null series. This guards that directly.
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

    const allSlots: IndexChartPoint[] = [
      { date: "2026-01-05", close: null, gap },
      { date: "2026-01-06", close: null, gap },
    ];

    const { container } = render(
      <IndexLineChart data={allSlots} accessibleLabel="ASPI history" />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".recharts-wrapper")).toHaveLength(1);
    });

    expect(
      container.querySelectorAll(
        ".recharts-yAxis .recharts-cartesian-axis-tick",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("IndexChartTooltip", () => {
  it("shows the gap label instead of the close price for a slot", () => {
    render(
      <IndexChartTooltip
        active
        payload={[{ payload: { date: "2026-01-05", close: null, gap } }]}
        locale="en-US"
        dateLabel="Date"
        closeLabel="Close"
        gapLabels={DEFAULT_GAP_LABELS}
      />,
    );

    expect(
      screen.getByText("No data · Jan 5 – Jan 6, 2026"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Close:/)).not.toBeInTheDocument();
  });

  it("shows the close price as usual for a real point", () => {
    render(
      <IndexChartTooltip
        active
        payload={[{ payload: { date: "2026-01-02", close: 15000 } }]}
        locale="en-US"
        dateLabel="Date"
        closeLabel="Close"
        gapLabels={DEFAULT_GAP_LABELS}
      />,
    );

    expect(screen.getByText(/Close:/)).toBeInTheDocument();
    expect(screen.queryByText(/No data/)).not.toBeInTheDocument();
  });
});

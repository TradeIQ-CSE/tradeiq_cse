// Shared chart-side rendering for a data gap (docs/plans/data-gap-handling.md
// §4): the grey ReferenceArea band, its label, and the tooltip/screen-reader
// text both CandlestickChart and IndexLineChart need. Kept separate from
// lib/data-gaps.ts, which stays pure/framework-agnostic — everything here is
// Recharts- and React-specific.

import { ReferenceArea } from "recharts";
import {
  DataGap,
  GapKindLabels,
  GapRun,
  formatGapBoundary,
  formatGapLabel,
} from "../../lib/data-gaps";
import { chartPalette } from "./chart-theme";

export interface GapLabels {
  /** Prefix for a `missing_data` band, tooltip, and sr-only row. */
  gapMissingData: string;
  /** Prefix for a `market_closed` band, tooltip, and sr-only row. */
  gapMarketClosed: string;
  /** Screen-reader-table row text for one gap, e.g.
   * "Data gap, 1 Jan 2026 to 12 Jun 2026". */
  gapRow: (params: { kind: string; from: string; to: string }) => string;
}

export const DEFAULT_GAP_LABELS: GapLabels = {
  gapMissingData: "Data gap",
  gapMarketClosed: "Market closed",
  gapRow: ({ kind, from, to }) => `${kind}, ${from} to ${to}`,
};

function kindLabels(labels: GapLabels): GapKindLabels {
  return { missingData: labels.gapMissingData, marketClosed: labels.gapMarketClosed };
}

export function gapText(gap: DataGap, locale: string, labels: GapLabels): string {
  return formatGapLabel(gap, locale, kindLabels(labels));
}

/** The sr-only table's row text for one gap, e.g.
 * "Data gap, 1 Jan 2026 to 12 Jun 2026" — both boundary dates always carry
 * their year, unlike the band label's compact "1 Jan – 12 Jun 2026". */
export function gapRowText(gap: DataGap, locale: string, labels: GapLabels): string {
  const kind =
    gap.kind === "market_closed" ? labels.gapMarketClosed : labels.gapMissingData;
  return labels.gapRow({
    kind,
    from: formatGapBoundary(gap.from, locale),
    to: formatGapBoundary(gap.to, locale),
  });
}

/** A band needs roughly this many pixels before its label fits without
 * spilling past the band's own edges; narrower bands rely on the tooltip
 * instead (docs/plans/data-gap-handling.md §4). */
const MIN_LABEL_WIDTH = 90;

interface LabelViewBox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * A Recharts label render function. Recharts calls this with the
 * ReferenceArea's own resolved pixel box, which is exactly what's needed to
 * hide the label once the band is too narrow to hold it — there is no other
 * way to know the band's on-screen width ahead of render.
 */
function gapLabelRenderer(text: string) {
  return ({ viewBox }: { viewBox?: LabelViewBox }) => {
    // No signal an <svg> can hide behind here — the label content function
    // has to return *something* renderable, so an empty fragment stands in
    // for "no label", which is what a too-narrow band gets.
    if (!viewBox || (viewBox.width ?? 0) < MIN_LABEL_WIDTH) return <></>;
    return (
      <text
        x={(viewBox.x ?? 0) + (viewBox.width ?? 0) / 2}
        y={(viewBox.y ?? 0) + 14}
        textAnchor="middle"
        fontSize={10}
        fill={chartPalette.tick}
      >
        {text}
      </text>
    );
  };
}

/**
 * One `<ReferenceArea>` per run of consecutive gap slots visible in the
 * window, filled with the shared `chartPalette.gap` token. `market_closed`
 * gets a lighter fillOpacity than `missing_data` — the same band mechanism,
 * not a second colour (the plan calls this a "lighter/hatched variant").
 *
 * `withLabel` is off on the volume panel: the price/line panel above it
 * already carries the label, and repeating it would just be noise.
 */
export function GapBands({
  runs,
  locale,
  labels,
  withLabel = true,
}: {
  runs: readonly GapRun[];
  locale: string;
  labels: GapLabels;
  withLabel?: boolean;
}) {
  return (
    <>
      {runs.map((run) => (
        <ReferenceArea
          key={`${run.gap.kind}-${run.gap.from}-${run.gap.to}-${run.startIndex}`}
          x1={run.from}
          x2={run.to}
          ifOverflow="visible"
          fill={chartPalette.gap}
          fillOpacity={run.gap.kind === "market_closed" ? 0.18 : 0.4}
          stroke="none"
          label={
            withLabel ? gapLabelRenderer(gapText(run.gap, locale, labels)) : false
          }
        />
      ))}
    </>
  );
}

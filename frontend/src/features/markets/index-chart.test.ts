import { describe, expect, it } from "vitest";
import { resampleIndexValues } from "./index-chart";
import { IndexValue } from "./types";

const dailyValues: IndexValue[] = [
  { date: "2026-01-05", close: 100 }, // Mon, week of 2026-01-05
  { date: "2026-01-06", close: 101 },
  { date: "2026-01-09", close: 103 }, // Fri, same week
  { date: "2026-01-12", close: 110 }, // Mon, next week
  { date: "2026-01-13", close: 111 },
];

describe("resampleIndexValues", () => {
  it("returns the daily series unchanged", () => {
    expect(resampleIndexValues(dailyValues, "daily")).toEqual(
      dailyValues.map((value) => ({ date: value.date, close: value.close })),
    );
  });

  it("buckets weekly by real trading days, taking the last close in each week", () => {
    const result = resampleIndexValues(dailyValues, "weekly");

    expect(result).toEqual([
      { date: "2026-01-05", periodEnd: "2026-01-09", close: 103 },
      { date: "2026-01-12", periodEnd: "2026-01-13", close: 111 },
    ]);
  });

  it("buckets monthly the same way, never averaging or inventing values", () => {
    const spanningMonths: IndexValue[] = [
      { date: "2026-01-30", close: 100 },
      { date: "2026-02-02", close: 105 },
      { date: "2026-02-27", close: 108 },
    ];

    expect(resampleIndexValues(spanningMonths, "monthly")).toEqual([
      { date: "2026-01-30", periodEnd: "2026-01-30", close: 100 },
      { date: "2026-02-02", periodEnd: "2026-02-27", close: 108 },
    ]);
  });

  it("does not fabricate a periodEnd for a bucket with only one real day", () => {
    const result = resampleIndexValues([{ date: "2026-03-04", close: 50 }], "weekly");

    // start === end for a single-day bucket, so the chart's date label
    // collapses it to one date instead of "Mar 4 - Mar 4".
    expect(result).toEqual([
      { date: "2026-03-04", periodEnd: "2026-03-04", close: 50 },
    ]);
  });
});

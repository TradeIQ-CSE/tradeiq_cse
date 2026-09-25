import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiHistoryLine,
  RiLineChartLine,
  RiLoader4Line,
  RiRefreshLine,
  RiTimeLine,
  RiWallet3Line,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  AppNotice,
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
  StatSurface,
} from "@/components/application/layout/application-layout";
import { cx } from "@/utils/cx";
import {
  getBacktestRunResults,
  getBacktestRunStatus,
} from "../api/backtestApi";
import type {
  BacktestEquityPoint,
  BacktestResultsResponse,
  BacktestStatusResponse,
} from "../domain/types";
import { useDataCoverage } from "../../markets/useDataCoverage";
import { crossingDataGaps, type DataGap } from "../../../lib/data-gaps";
import { chartPalette } from "../../../components/charts/chart-theme";
import { formatDay } from "../domain/descriptions";
import { RunReveal } from "./RunReveal";
import { TradeReason } from "./RuleList";
import { useRunReveal } from "./useRunReveal";

const MAX_TRANSIENT_RETRIES = 5;

const STATUS_COPY = {
  queued: {
    title: "Waiting to start",
    description: "Your test will start in a moment",
    Icon: RiTimeLine,
  },
  running: {
    title: "Running your test",
    description: "Checking your rules against each trading day",
    Icon: RiLoader4Line,
  },
  completed: {
    title: "Your test is done",
    description: "Here’s how your idea would have done",
    Icon: RiCheckboxCircleLine,
  },
  failed: {
    title: "Your test couldn’t finish",
    description: "Something went wrong. Please try again",
    Icon: RiCloseCircleLine,
  },
};

function formatCurrency(value: number) {
  return `LKR ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** UTC-midnight timestamp for an ISO date, matching lib/data-gaps.ts's own
 * date math (never a plain `new Date(dateString)`, which applies the
 * runtime's local time zone to a midnight-only value). */
function dayTimestamp(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

/** One point in `data` immediately before a crossed gap, paired with the
 * point immediately after it — the pair a segment break and a grey rect sit
 * between. */
interface GapStraddle {
  gap: DataGap;
  before: BacktestEquityPoint;
  after: BacktestEquityPoint;
}

/** The gaps of both kinds this equity curve crosses, each paired with the
 * two real observations either side of it — matching the price charts,
 * which band a `market_closed` closure as well as a `missing_data` gap
 * (docs/plans/data-gap-handling.md §6). The curve only ever has a point on
 * a day the engine actually priced, so a crossed gap always shows up as
 * exactly one adjacent pair whose dates skip over it. */
function findGapStraddles(
  data: readonly BacktestEquityPoint[],
  gaps: readonly DataGap[],
): GapStraddle[] {
  if (data.length < 2) return [];
  const crossed = crossingDataGaps(gaps, data[0].date, data[data.length - 1].date, [
    'missing_data',
    'market_closed',
  ]);
  const straddles: GapStraddle[] = [];
  for (const gap of crossed) {
    for (let index = 0; index < data.length - 1; index += 1) {
      const before = data[index];
      const after = data[index + 1];
      if (gap.from > before.date && gap.to < after.date) {
        straddles.push({ gap, before, after });
        break;
      }
    }
  }
  return straddles;
}

/** A band needs roughly this many viewBox units before "Data gap" fits
 * without spilling past its own edges — mirrors gap-band.tsx's
 * `MIN_LABEL_WIDTH`, scaled down for this chart's narrower 720-wide viewBox
 * versus a full-width Recharts panel. */
const MIN_LABEL_WIDTH = 48;

function EquityCurvePreview({
  data,
  gaps,
}: {
  data: BacktestEquityPoint[];
  gaps: DataGap[];
}) {
  // Found on the full-resolution series before any sampling: the points
  // bordering a gap have to survive downsampling below, and the caption's
  // session count is only correct against every gap the run actually
  // crossed, not just the ones a coarser sample happens to still straddle.
  const straddles = useMemo(() => findGapStraddles(data, gaps), [data, gaps]);

  const sampled = useMemo(() => {
    if (data.length <= 120) return data;
    const interval = Math.ceil(data.length / 120);
    const kept = new Set<number>();
    data.forEach((_, index) => {
      if (index % interval === 0) kept.add(index);
    });
    kept.add(data.length - 1);
    // Never sample away a gap's bordering points: losing either one would
    // either lose the segment break or misplace the grey rect.
    straddles.forEach(({ before, after }) => {
      kept.add(data.indexOf(before));
      kept.add(data.indexOf(after));
    });
    return [...kept].sort((a, b) => a - b).map((index) => data[index]);
  }, [data, straddles]);

  if (sampled.length === 0) {
    return (
      <p className="text-body-2-regular text-text-secondary">
        No daily values to show for this test
      </p>
    );
  }

  const values = sampled.map((point) => point.totalEquity);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || 1;
  const width = 720;
  const height = 180;
  const first = data[0];
  const last = data[data.length - 1];
  const firstMs = dayTimestamp(first.date);
  const lastMs = dayTimestamp(last.date);
  const dateSpanMs = lastMs - firstMs || 1;

  // Date-proportional, not index-proportional: a gap between two sampled
  // points then keeps the width its own missing sessions actually cover,
  // rather than collapsing to the same one-point gap as its neighbours.
  const xForDate = (date: string) =>
    first.date === last.date ? width / 2 : ((dayTimestamp(date) - firstMs) / dateSpanMs) * width;
  const yForEquity = (equity: number) =>
    height - ((equity - minimum) / spread) * height;

  // Segments split at every straddle the sampled series still carries (its
  // bordering points are guaranteed present above), so the line never
  // connects across a gap it has no data for.
  const straddleBreaks = new Set(
    straddles.map(({ before, after }) => `${before.date}|${after.date}`),
  );
  const segments: BacktestEquityPoint[][] = [];
  let currentSegment: BacktestEquityPoint[] = [];
  sampled.forEach((point, index) => {
    currentSegment.push(point);
    const next = sampled[index + 1];
    if (next && straddleBreaks.has(`${point.date}|${next.date}`)) {
      segments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length > 0) segments.push(currentSegment);

  // Only `missing_data` sessions are actually missing — a `market_closed`
  // closure is real market history the engine correctly has no bars for,
  // so it never counts toward "sessions without market data".
  const totalGapSessions = straddles
    .filter(({ gap }) => gap.kind === 'missing_data')
    .reduce((sum, { gap }) => sum + gap.sessions, 0);

  return (
    <figure className="flex flex-col gap-3">
      <div className="h-48 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`Portfolio equity from ${first.date} to ${last.date}`}
        >
          {straddles.map(({ gap }) => {
            const x1 = xForDate(gap.from);
            const x2 = xForDate(gap.to);
            const bandWidth = x2 - x1;
            const isClosure = gap.kind === 'market_closed';
            // Same fillOpacity convention as gap-band.tsx's GapBands: a
            // market_closed band reads lighter than a missing_data one,
            // the same band mechanism rather than a second colour.
            const fillOpacity = isClosure ? 0.18 : 0.4;
            const label = isClosure ? 'Market closed' : 'Data gap';
            const titleText = isClosure
              ? `Market closed, ${gap.from} to ${gap.to}`
              : `Data gap, ${gap.from} to ${gap.to}`;
            return (
              <g key={`${gap.kind}-${gap.from}-${gap.to}`}>
                <rect
                  x={x1}
                  y={0}
                  width={Math.max(bandWidth, 0)}
                  height={height}
                  fill={chartPalette.gap}
                  fillOpacity={fillOpacity}
                />
                {bandWidth >= MIN_LABEL_WIDTH && (
                  <text
                    x={x1 + bandWidth / 2}
                    y={14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={chartPalette.tick}
                  >
                    {label}
                  </text>
                )}
                <title>{titleText}</title>
              </g>
            );
          })}
          {segments.map((segment) => (
            <polyline
              key={segment[0].date}
              points={segment
                .map(
                  (point) =>
                    `${xForDate(point.date).toFixed(2)},${yForEquity(point.totalEquity).toFixed(2)}`,
                )
                .join(" ")}
              fill="none"
              stroke="var(--color-chart-1)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <figcaption className="grid gap-2 text-body-2-regular text-text-secondary sm:grid-cols-3">
        <span>{formatDay(first.date)} to {formatDay(last.date)}</span>
        <span>
          Low {formatCurrency(minimum)} · High {formatCurrency(maximum)}
        </span>
        <span className="sm:text-right">
          {data.length.toLocaleString("en-LK")} trading days
        </span>
      </figcaption>
      {totalGapSessions > 0 && (
        <p className="text-body-2-regular text-text-secondary">
          Includes {totalGapSessions.toLocaleString("en-LK")} trading days in a
          data gap
        </p>
      )}
    </figure>
  );
}

/** The caveat line and the page's buttons, shared by saved and preview results. */
export function ResultsFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-2-regular text-text-secondary">
        Based on daily closing prices and your settings · Past results don’t promise future ones
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">{children}</div>
    </div>
  );
}

export function ResultsView({
  results,
  gaps,
}: {
  results: BacktestResultsResponse;
  gaps: DataGap[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatSurface
          label="Starting cash"
          value={formatCurrency(results.initialCapital)}
          supportingText="Virtual money"
          icon={RiWallet3Line}
        />
        <StatSurface
          label="Final value"
          value={formatCurrency(results.finalEquity)}
          supportingText="Cash plus shares held"
          icon={RiLineChartLine}
        />
        <StatSurface
          label="Final cash"
          value={formatCurrency(results.finalCash)}
          supportingText="Cash left at the end"
          icon={RiWallet3Line}
        />
        <StatSurface
          label="Trades"
          value={results.trades.length.toLocaleString("en-LK")}
          supportingText="Buys and sells"
          icon={RiHistoryLine}
        />
      </div>

      <AppPanel className="flex flex-col gap-4">
        <div>
          <h2 className="text-headline-medium text-text-primary">
            Portfolio value over time
          </h2>
          <p className="text-body-2-regular text-text-secondary">
            What your virtual portfolio was worth each trading day
          </p>
        </div>
        <EquityCurvePreview data={results.equityCurve} gaps={gaps} />
      </AppPanel>

      <AppPanel className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-headline-medium text-text-primary">
              Trades
            </h2>
            <p className="text-body-2-regular text-text-secondary">
              {results.trades.length === 1
                ? "1 buy or sell"
                : `${results.trades.length.toLocaleString("en-LK")} buys and sells`}
            </p>
          </div>
        </div>
        {results.trades.length === 0 ? (
          <p className="border-t border-separator-border p-4 text-body-2-regular text-text-secondary sm:p-5">
            No trades. Your buy rule was never met in these dates
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-separator-border">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-background-secondary-default">
                <tr className="text-caption-1-medium text-text-secondary">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                  <th className="px-4 py-3 text-right">Fees</th>
                  <th className="px-4 py-3 text-right">Cash in or out</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {results.trades.map((trade) => (
                  <tr key={trade.id} className="text-body-2-regular text-text-primary">
                    <td className="whitespace-nowrap px-4 py-3">{formatDay(trade.date)}</td>
                    <td className="px-4 py-3">
                      {trade.type === "BUY" ? "Buy" : "Sell"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(trade.executionPrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {trade.quantity.toLocaleString("en-LK")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(trade.fees.total)}
                    </td>
                    <td
                      className={cx(
                        "px-4 py-3 text-right tabular-nums",
                        trade.netCashFlow >= 0
                          ? "text-status-lime-text"
                          : "text-status-rose-text",
                      )}
                    >
                      {formatCurrency(trade.netCashFlow)}
                    </td>
                    <td className="max-w-64 px-4 py-3">
                      <TradeReason code={trade.reason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AppPanel>
    </div>
  );
}

export function StatusStep() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  // Never blocks this page: the equity curve just renders without gap
  // segments/rects until coverage loads, same as the wizard's own steps.
  const coverageQuery = useDataCoverage();
  const priceGaps = coverageQuery.data?.prices.gaps ?? [];
  const [statusData, setStatusData] = useState<BacktestStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [, setRetryCount] = useState(0);
  const [results, setResults] = useState<BacktestResultsResponse | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsVersion, setResultsVersion] = useState(0);

  const retryStatus = () => {
    setRetryCount(0);
    setError(null);
    setPollCount((count) => count + 1);
  };

  useEffect(() => {
    if (!runId) return;
    let isCurrent = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchStatus = async () => {
      try {
        const data = await getBacktestRunStatus(runId);
        if (!isCurrent) return;
        setStatusData(data);
        setError(null);
        setRetryCount(0);
        if (data.status === "queued" || data.status === "running") {
          timer = setTimeout(() => {
            if (isCurrent) setPollCount((count) => count + 1);
          }, 1500);
        }
      } catch (requestError: unknown) {
        if (!isCurrent) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to check backtest status.",
        );
        setRetryCount((previous) => {
          const next = previous + 1;
          if (next < MAX_TRANSIENT_RETRIES) {
            timer = setTimeout(() => {
              if (isCurrent) setPollCount((count) => count + 1);
            }, 2000);
          }
          return next;
        });
      }
    };

    void fetchStatus();
    return () => {
      isCurrent = false;
      if (timer) clearTimeout(timer);
    };
  }, [pollCount, runId]);

  useEffect(() => {
    if (!runId || statusData?.status !== "completed") return;
    let isCurrent = true;
    setResultsLoading(true);
    setResultsError(null);
    getBacktestRunResults(runId)
      .then((data) => {
        if (!isCurrent) return;
        setResults(data);
        setResultsLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!isCurrent) return;
        setResultsError(
          requestError instanceof Error
            ? requestError.message
            : "Backtest results could not be loaded.",
        );
        setResultsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [resultsVersion, runId, statusData?.status]);

  const { playing, finish: finishReveal } = useRunReveal();
  const currentStatus = statusData?.status || "queued";
  // Held on the intro until it finishes, so the "done" panel and the
  // results never flash in underneath it.
  const revealing = playing && currentStatus === "completed" && results !== null;
  const status = STATUS_COPY[currentStatus];
  const StatusIcon = status.Icon;

  return (
    <AppPage className="max-w-5xl">
      <PageIntro
        eyebrow="Backtesting"
        title="Your test"
      />

      {revealing && results ? (
        <RunReveal onDone={finishReveal} />
      ) : (
        <AppPanel className="flex flex-col items-center gap-5 py-8 text-center">
          <span
            className={cx(
              "flex size-16 items-center justify-center rounded-full",
              currentStatus === "completed" && "bg-status-lime-background text-status-lime-text",
              currentStatus === "failed" && "bg-status-rose-background text-status-rose-text",
              currentStatus === "running" && "bg-status-yellow-background text-status-yellow-text",
              currentStatus === "queued" && "bg-status-blue-background text-status-blue-text",
            )}
          >
            <StatusIcon
              className={cx(
                "size-8",
                currentStatus === "running" && "animate-spin",
              )}
              aria-hidden
            />
          </span>
          <div className="flex max-w-2xl flex-col gap-1">
            <h2 className="text-title-2-medium text-text-primary">{status.title}</h2>
            <p className="text-body-regular text-text-secondary">
              {currentStatus === "failed" && statusData?.failureReason
                ? statusData.failureReason
                : status.description}
            </p>
          </div>

          <dl className="grid w-full max-w-2xl gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4 text-left sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-caption-1-medium text-text-secondary">Test ID</dt>
              <dd className="truncate text-body-2-medium text-text-primary" title={runId}>
                {runId || "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-caption-1-medium text-text-secondary">Started</dt>
              <dd className="text-body-2-medium text-text-primary">
                {statusData?.startedAt
                  ? new Date(statusData.startedAt).toLocaleString()
                  : "Waiting"}
              </dd>
            </div>
            <div>
              <dt className="text-caption-1-medium text-text-secondary">Finished</dt>
              <dd className="text-body-2-medium text-text-primary">
                {statusData?.completedAt
                  ? new Date(statusData.completedAt).toLocaleString()
                  : "Not yet"}
              </dd>
            </div>
          </dl>

          {error && (
            <AppNotice tone="error" title="Couldn’t check on your test" className="w-full max-w-2xl text-left">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={RiRefreshLine}
                  onClick={retryStatus}
                >
                  Try again
                </Button>
              </div>
            </AppNotice>
          )}
        </AppPanel>
      )}

      {currentStatus === "completed" && !revealing && (
        <>
          {resultsLoading && !results ? (
            <PageState
              kind="loading"
              title="Loading your results"
            />
          ) : resultsError ? (
            <PageState
              kind="error"
              title="Couldn’t load your results"
              description={resultsError}
              action={
                <Button
                  variant="secondary"
                  leadingIcon={RiRefreshLine}
                  onClick={() => setResultsVersion((version) => version + 1)}
                >
                  Try again
                </Button>
              }
            />
          ) : results ? (
            <ResultsView results={results} gaps={priceGaps} />
          ) : null}
        </>
      )}

      <ResultsFooter>
        <Button
          variant="secondary"
          leadingIcon={RiArrowLeftLine}
          onClick={() => navigate("/markets")}
          className="w-full sm:w-auto"
        >
          Browse companies
        </Button>
        <Button
          onClick={() => navigate("/backtests/new")}
          className="w-full sm:w-auto"
        >
          Test another idea
        </Button>
      </ResultsFooter>
    </AppPage>
  );
}

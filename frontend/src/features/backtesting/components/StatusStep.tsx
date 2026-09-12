import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiHistoryLine,
  RiLoader4Line,
  RiRefreshLine,
  RiTimeLine,
  RiWallet3Line,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
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

const MAX_TRANSIENT_RETRIES = 5;

const STATUS_COPY = {
  queued: {
    title: "Simulation Queued",
    description:
      "The run is waiting for the historical simulation worker to begin.",
    color: "blue" as const,
    Icon: RiTimeLine,
  },
  running: {
    title: "Simulation in Progress...",
    description:
      "TradeIQ is checking the configured rules against the available daily bars.",
    color: "yellow" as const,
    Icon: RiLoader4Line,
  },
  completed: {
    title: "Backtest Simulation Complete!",
    description:
      "The historical run finished. The figures below come from the persisted API result.",
    color: "lime" as const,
    Icon: RiCheckboxCircleLine,
  },
  failed: {
    title: "Simulation Failed",
    description:
      "The engine could not complete this run. Review the failure detail before trying again.",
    color: "rose" as const,
    Icon: RiCloseCircleLine,
  },
};

function formatCurrency(value: number) {
  return `LKR ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function EquityCurvePreview({ data }: { data: BacktestEquityPoint[] }) {
  const sampled = useMemo(() => {
    if (data.length <= 120) return data;
    const interval = Math.ceil(data.length / 120);
    const points = data.filter((_, index) => index % interval === 0);
    const last = data[data.length - 1];
    if (points[points.length - 1] !== last) points.push(last);
    return points;
  }, [data]);

  if (sampled.length === 0) {
    return (
      <AppNotice title="No equity observations returned">
        This completed run did not include equity-curve points.
      </AppNotice>
    );
  }

  const values = sampled.map((point) => point.totalEquity);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || 1;
  const width = 720;
  const height = 180;
  const points = sampled
    .map((point, index) => {
      const x =
        sampled.length === 1 ? width / 2 : (index / (sampled.length - 1)) * width;
      const y = height - ((point.totalEquity - minimum) / spread) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const first = data[0];
  const last = data[data.length - 1];

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
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <figcaption className="grid gap-2 text-body-2-regular text-text-secondary sm:grid-cols-3">
        <span>{data.length.toLocaleString("en-LK")} daily observations</span>
        <span>
          Range: {formatCurrency(minimum)} to {formatCurrency(maximum)}
        </span>
        <span className="sm:text-right">
          {first.date} to {last.date}
        </span>
      </figcaption>
    </figure>
  );
}

function ResultsView({ results }: { results: BacktestResultsResponse }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatSurface
          label="Starting capital"
          value={formatCurrency(results.initialCapital)}
          supportingText="Hypothetical opening cash"
          icon={RiWallet3Line}
        />
        <StatSurface
          label="Final equity"
          value={formatCurrency(results.finalEquity)}
          supportingText="Cash plus ending position value"
          icon={RiCheckboxCircleLine}
        />
        <StatSurface
          label="Final cash"
          value={formatCurrency(results.finalCash)}
          supportingText="Uninvested cash after the final bar"
          icon={RiWallet3Line}
        />
        <StatSurface
          label="Trade count"
          value={results.trades.length.toLocaleString("en-LK")}
          supportingText="Executions returned in the trade ledger"
          icon={RiHistoryLine}
        />
      </div>

      <AppPanel className="flex flex-col gap-4">
        <div>
          <h2 className="text-headline-medium text-text-primary">
            Equity through the period
          </h2>
          <p className="text-body-regular text-text-secondary">
            Daily simulated portfolio equity returned by the backtest API.
          </p>
        </div>
        <EquityCurvePreview data={results.equityCurve} />
      </AppPanel>

      <AppPanel className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-headline-medium text-text-primary">
              Simulated trades
            </h2>
            <p className="text-body-regular text-text-secondary">
              {results.trades.length.toLocaleString("en-LK")} executions
              returned for this historical run.
            </p>
          </div>
        </div>
        {results.trades.length === 0 ? (
          <div className="border-t border-separator-border p-4 sm:p-5">
            <AppNotice title="No trades were triggered">
              The configured entry rule did not produce an execution in the
              selected period.
            </AppNotice>
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-separator-border">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-background-secondary-default">
                <tr className="text-caption-1-semibold text-text-secondary">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-right">Fees</th>
                  <th className="px-4 py-3 text-right">Cash effect</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {results.trades.map((trade) => (
                  <tr key={trade.id} className="text-body-2-regular text-text-primary">
                    <td className="whitespace-nowrap px-4 py-3">{trade.date}</td>
                    <td className="px-4 py-3">
                      <Chip color={trade.type === "BUY" ? "blue" : "rose"}>
                        {trade.type === "BUY" ? "Buy" : "Sell"}
                      </Chip>
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
                    <td className="max-w-64 px-4 py-3 text-text-secondary">
                      {trade.reason}
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

  const currentStatus = statusData?.status || "queued";
  const status = STATUS_COPY[currentStatus];
  const StatusIcon = status.Icon;

  return (
    <AppPage className="max-w-5xl">
      <PageIntro
        eyebrow="Historical simulation"
        title="Backtest run"
        description="Follow the run from queue to completion, then review the persisted historical results returned by TradeIQ."
        actions={<Chip color={status.color}>{currentStatus.toUpperCase()}</Chip>}
      />

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
          <h1 className="text-title-1-medium text-text-primary">{status.title}</h1>
          <p className="text-body-regular text-text-secondary">
            {currentStatus === "failed" && statusData?.failureReason
              ? statusData.failureReason
              : status.description}
          </p>
        </div>

        <dl className="grid w-full max-w-2xl gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4 text-left sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-caption-1-medium text-text-tertiary">Run ID</dt>
            <dd className="truncate text-body-2-medium text-text-primary" title={runId}>
              {runId || "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-caption-1-medium text-text-tertiary">Started</dt>
            <dd className="text-body-2-medium text-text-primary">
              {statusData?.startedAt
                ? new Date(statusData.startedAt).toLocaleString()
                : "Waiting"}
            </dd>
          </div>
          <div>
            <dt className="text-caption-1-medium text-text-tertiary">Completed</dt>
            <dd className="text-body-2-medium text-text-primary">
              {statusData?.completedAt
                ? new Date(statusData.completedAt).toLocaleString()
                : "Not yet"}
            </dd>
          </div>
        </dl>

        {error && (
          <AppNotice tone="error" title="Status check failed" className="w-full max-w-2xl text-left">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <Button
                variant="secondary"
                size="small"
                leadingIcon={RiRefreshLine}
                onClick={retryStatus}
              >
                Retry Status Check
              </Button>
            </div>
          </AppNotice>
        )}
      </AppPanel>

      {currentStatus === "completed" && (
        <>
          {resultsLoading && !results ? (
            <PageState
              kind="loading"
              title="Loading completed results"
              description="Retrieving the persisted trade ledger and equity curve."
            />
          ) : resultsError ? (
            <PageState
              kind="error"
              title="Results could not be loaded"
              description={resultsError}
              action={
                <Button
                  variant="secondary"
                  leadingIcon={RiRefreshLine}
                  onClick={() => setResultsVersion((version) => version + 1)}
                >
                  Retry results
                </Button>
              }
            />
          ) : results ? (
            <ResultsView results={results} />
          ) : null}
        </>
      )}

      <AppNotice title="Interpret results carefully">
        This is a historical simulation based on available end-of-day data and
        the assumptions you supplied. It does not model every source of
        slippage, liquidity risk, or future market behaviour.
      </AppNotice>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          leadingIcon={RiArrowLeftLine}
          onClick={() => navigate("/markets")}
          className="w-full sm:w-auto"
        >
          Browse markets
        </Button>
        <Button
          onClick={() => navigate("/backtests/new/security")}
          className="w-full sm:w-auto"
        >
          Configure another backtest
        </Button>
      </div>
    </AppPage>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../components/base/segmented-control/segmented-control";
import { MarketTerm } from "../../components/domain/market-term";
import { cx } from "../../utils/cx";
import { localeFor } from "../../i18n";
import { ApiError } from "../../lib/api";
import { formatPrice, formatSigned, formatVolume } from "./format";
import { MarketRanking, RankingList } from "./types";
import { useMarketOverview } from "./useMarketOverview";

const LISTS: RankingList[] = ["gainers", "losers", "most_active"];
const ROW_COUNT = 6;

interface TopMoversProps {
  /** Kept in step with the securities table so both describe one slice. */
  asOf?: string;
  sector?: string;
}

/**
 * Top movers as a ranked bar list rather than a chart.
 *
 * Six rows of one measure is the case a bar list answers better than an axis:
 * the bar behind each row encodes magnitude relative to the strongest mover,
 * so the ranking reads at a glance while the exact figure stays legible as
 * text. An axis would spend most of the card's width on chrome for six values.
 *
 * The bar is a share of the largest absolute move in the visible list, not a
 * share of some fixed range — a day where everything moves 0.3% should still
 * show a full-width leader, because the card ranks movers rather than
 * measuring them against an absolute scale.
 */
export function TopMovers({ asOf, sector }: TopMoversProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [list, setList] = useState<RankingList>("gainers");

  const { data, isPending, isFetching, isError, error } = useMarketOverview({
    as_of: asOf,
    sector,
    limit: ROW_COUNT,
  });

  const rows: MarketRanking[] = data?.data?.[list] ?? [];
  // Most-active ranks on volume, the other two on percentage change, so the
  // bar has to be scaled by whichever measure the list is actually ordered by.
  const measure = (row: MarketRanking) =>
    list === "most_active" ? row.volume : Math.abs(row.change_pct);
  const peak = rows.reduce((max, row) => Math.max(max, measure(row)), 0);

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-border-table bg-background-primary-default shadow-xs"
      aria-busy={isFetching}
    >
      {isFetching && (
        <span
          className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-button-primary"
          role="status"
          aria-label={t("markets.movers.loading")}
        />
      )}

      <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pt-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-headline-medium text-text-primary">
            {t("markets.movers.title")}
          </h2>
          <p className="text-body-2-medium text-text-tertiary">
            {data?.data?.as_of
              ? t("markets.asOf", { date: data.data.as_of })
              : t("markets.movers.subtitle")}
          </p>
        </div>

        <div className="max-w-full overflow-x-auto pb-0.5">
          <SegmentedControl
            aria-label={t("markets.movers.title")}
            selectedKeys={new Set([list])}
            onSelectionChange={(keys) => {
              const [next] = [...keys];
              if (next) setList(next as RankingList);
            }}
          >
            {LISTS.map((value) => (
              <SegmentedControlItem key={value} id={value}>
                {t(`markets.movers.lists.${value}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      </div>

      {isError ? (
        <p className="px-4 py-8 text-center text-body-medium text-status-rose-text">
          {error instanceof ApiError
            ? error.body.message
            : t("markets.movers.unreachable")}
        </p>
      ) : isPending ? (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {Array.from({ length: ROW_COUNT }).map((_, index) => (
            <li
              key={index}
              className="h-9 animate-pulse rounded-lg bg-background-tertiary-default"
            />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-body-medium text-text-secondary">
          {t("markets.movers.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-1 px-2 pb-3 sm:px-3 sm:pb-4">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-2 text-caption-1-semibold text-text-tertiary sm:grid-cols-[minmax(0,1fr)_6rem_5rem] sm:gap-3">
            <MarketTerm
              term="security"
              label={t("markets.movers.columns.security")}
              className="min-w-0 flex-1"
            />
            <span className="hidden text-right sm:block">
              <MarketTerm
                term="close"
                label={t("markets.movers.columns.close")}
              />
            </span>
            <span className="text-right">
              <MarketTerm
                term={list === "most_active" ? "volume" : "change"}
                label={t(
                  list === "most_active"
                    ? "markets.movers.columns.volume"
                    : "markets.movers.columns.change",
                )}
              />
            </span>
          </div>

          <ol className="flex flex-col gap-1">
            {rows.map((row) => {
              const share = peak > 0 ? (measure(row) / peak) * 100 : 0;
              const positive = row.change_pct >= 0;
              return (
                <li key={row.symbol}>
                  <Link
                    to={`/markets/${encodeURIComponent(row.symbol)}`}
                    aria-label={t("markets.viewDetails", {
                      symbol: row.symbol,
                    })}
                    className="relative grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 overflow-hidden rounded-xl px-2 py-2.5 outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring sm:grid-cols-[minmax(0,1fr)_6rem_5rem] sm:gap-3"
                  >
                    {/* The share bar sits behind the row rather than beside it,
                        so the label keeps full width on a narrow screen. */}
                    <span
                      aria-hidden="true"
                      className={cx(
                        "absolute inset-y-0 left-0 rounded-lg",
                        positive ? "bg-market-gain-bar" : "bg-market-loss-bar",
                      )}
                      style={{ width: `${share}%` }}
                    />
                    <span className="relative flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-medium text-text-primary">
                        {row.symbol}
                      </span>
                      <span className="truncate text-body-2-medium text-text-tertiary">
                        {row.company_name}
                      </span>
                    </span>
                    <span className="relative hidden text-right text-body-medium tabular-nums text-text-secondary sm:block">
                      {formatPrice(row.close, locale)}
                    </span>
                    <span
                      className={cx(
                        "relative text-right text-body-medium tabular-nums",
                        positive
                          ? "text-status-lime-text"
                          : "text-status-rose-text",
                      )}
                    >
                      {list === "most_active"
                        ? formatVolume(row.volume, locale)
                        : `${formatSigned(row.change_pct, 2, locale)}%`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RiArrowRightUpLine } from "@remixicon/react";
import { ApiError } from "../../lib/api";
import { readErrorText } from "./error-text";
import { localeFor } from "../../i18n";
import {
  changeDirection,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSignedMoney,
} from "./format";
import { usePositions } from "./usePortfolios";
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  NoticeCard,
  SkeletonRow,
  StateMessage,
} from "./ui";
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from "../../components/application/financial-data";

interface PositionsTableProps {
  portfolioId: string;
  asOf?: string;
}

const COLUMN_COUNT = 7;

export function PositionsTable({ portfolioId, asOf }: PositionsTableProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isFetching, isError, error } = usePositions(
    portfolioId,
    asOf,
  );

  if (isError) {
    if (
      error instanceof ApiError &&
      error.body.code === "PORTFOLIO_NOT_FOUND"
    ) {
      // The parent's canary (PortfolioScope) is already recovering from this
      // same 404 — render nothing rather than flash the raw backend message
      // before the parent unmounts this component.
      return null;
    }
    // §3.4: a held symbol with no close on the effective session fails the
    // whole response, not just that row — there is no partial positions
    // list to fall back to, and the date is never one the user can retry
    // into working, so the recovery copy names it and points at the picker
    // instead of rendering an empty table.
    if (error instanceof ApiError && error.body.code === "PRICE_UNAVAILABLE") {
      return (
        <NoticeCard>
          {t("portfolio.positions.priceUnavailable", {
            date: asOf || t("portfolio.summary.latestSession"),
          })}
        </NoticeCard>
      );
    }
    return (
      <ErrorCard>
        {readErrorText(error, t("portfolio.positions.unreachable"))}
      </ErrorCard>
    );
  }

  const rows = data?.data ?? [];
  const resolvedAsOf = data?.meta?.as_of ?? null;

  return (
    <Card busy={isFetching}>
      {isFetching && <CardProgress label={t("portfolio.positions.loading")} />}

      <CardHeading
        title={t("portfolio.positions.title")}
        subtitle={
          resolvedAsOf
            ? t("portfolio.summary.asOf", { date: resolvedAsOf })
            : undefined
        }
      />

      {!isPending && rows.length === 0 ? (
        <StateMessage>{t("portfolio.positions.empty")}</StateMessage>
      ) : (
        <div>
          <p className="border-y border-separator-border px-4 py-2 text-body-2-regular text-text-tertiary sm:hidden">
            {t("portfolio.positions.scrollHint")}
          </p>
          <div className="overflow-x-auto">
            <table className="bui-table portfolio-positions-table min-w-[920px]">
              <thead>
                <tr>
                  <th scope="col">{t("portfolio.positions.columns.symbol")}</th>
                  <th scope="col" className="text-right">
                    {t("portfolio.positions.columns.quantity")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("portfolio.positions.columns.averageCost")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("portfolio.positions.columns.price")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("portfolio.positions.columns.marketValue")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("portfolio.positions.columns.unrealizedPnl")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("portfolio.positions.columns.unrealizedReturnPct")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isPending && !data
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonRow columns={COLUMN_COUNT} key={index} />
                    ))
                  : rows.map((position) => {
                      const direction = changeDirection(
                        position.unrealized_pnl,
                      );
                      const tone = financialToneClass(position.unrealized_pnl);
                      return (
                        <tr key={position.symbol}>
                          <td className="text-text-primary">
                            <Link
                              to={`/markets/${encodeURIComponent(position.symbol)}`}
                              className="inline-flex items-center gap-1.5 text-body-medium text-text-primary outline-none hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                            >
                              {position.symbol}
                              <RiArrowRightUpLine
                                className="size-4 text-foreground-icon-tertiary"
                                aria-hidden
                              />
                            </Link>
                          </td>
                          <td className="text-right tabular-nums">
                            {formatQuantity(position.quantity, locale)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatMoney(position.average_cost, locale)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatMoney(position.price, locale)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatMoney(position.market_value, locale)}
                          </td>
                          <td className={`text-right tabular-nums ${tone}`}>
                            <FinancialDirectionGlyph direction={direction} />
                            {formatSignedMoney(position.unrealized_pnl, locale)}
                          </td>
                          <td className={`text-right tabular-nums ${tone}`}>
                            <FinancialDirectionGlyph direction={direction} />
                            {formatPercent(
                              position.unrealized_return_pct,
                              locale,
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

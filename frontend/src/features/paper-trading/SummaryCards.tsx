import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  RiBarChartBoxLine,
  RiCoinsLine,
  RiFundsLine,
  RiLineChartLine,
  RiWallet3Line,
} from "@remixicon/react";
import { ApiError } from "../../lib/api";
import { readErrorText } from "./error-text";
import { localeFor } from "../../i18n";
import {
  changeDirection,
  formatDay,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from "./format";
import { usePortfolioSummary } from "./usePortfolios";
import { Card, CardHeading, CardProgress, ErrorCard, NoticeCard } from "./ui";
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from "../../components/application/financial-data";
import { cx } from "../../utils/cx";

interface SummaryCardsProps {
  portfolioId: string;
  asOf?: string;
}

/** One labelled figure; shared with the dashboard's portfolio snapshot. */
export function SummaryStat({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
  icon: typeof RiFundsLine;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5">
      <Icon
        className="mt-0.5 size-5 shrink-0 text-foreground-icon-tertiary"
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-2-medium text-text-secondary">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cx(
              "truncate text-headline-medium tabular-nums",
              tone ?? "text-text-primary",
            )}
          >
            {value}
          </span>
          {sub && (
            <span className={cx("text-body-2-regular tabular-nums", tone)}>
              {sub}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ADR 0008: every figure here is read straight from the API response. No
// value on this page is derived by summing or subtracting other fields.
export function SummaryCards({ portfolioId, asOf }: SummaryCardsProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isFetching, isError, error } = usePortfolioSummary(
    portfolioId,
    asOf,
  );

  if (isError) {
    if (error instanceof ApiError && error.body.code === "PRICE_UNAVAILABLE") {
      return (
        <NoticeCard>
          {t("portfolio.summary.priceUnavailable", {
            date: asOf
            ? formatDay(asOf, locale)
            : t("portfolio.summary.latestSession"),
          })}
        </NoticeCard>
      );
    }
    return (
      <ErrorCard>
        {readErrorText(error, t("portfolio.summary.unreachable"))}
      </ErrorCard>
    );
  }

  if (isPending || !data) {
    return (
      <div
        className="h-44 animate-pulse rounded-3xl bg-background-secondary-default"
        aria-busy="true"
      />
    );
  }

  const summary = data.data;
  const totalDirection = changeDirection(summary.total_pnl);
  const returnDirection = changeDirection(summary.total_return_pct);
  const realizedDirection = changeDirection(summary.realized_pnl);
  const unrealizedDirection = changeDirection(summary.unrealized_pnl);

  return (
    <Card busy={isFetching}>
      {isFetching && <CardProgress label={t("portfolio.summary.loading")} />}

      <CardHeading
        title={t("portfolio.summary.title")}
        info={t("portfolio.summary.help")}
        subtitle={
          summary.as_of
            ? t("portfolio.summary.asOf", {
                date: formatDay(summary.as_of, locale),
              })
            : t("portfolio.summary.noSession")
        }
      />

      <div className="grid grid-cols-1 border-t border-separator-border py-1 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryStat
          icon={RiFundsLine}
          label={t("portfolio.summary.totalEquity")}
          value={formatMoney(summary.total_equity, locale)}
        />
        <SummaryStat
          icon={RiWallet3Line}
          label={t("portfolio.summary.cashBalance")}
          value={formatMoney(summary.cash_balance, locale)}
        />
        <SummaryStat
          icon={RiBarChartBoxLine}
          label={t("portfolio.summary.holdingsValue")}
          value={formatMoney(summary.holdings_value, locale)}
        />
        <SummaryStat
          icon={RiLineChartLine}
          label={t("portfolio.summary.totalPnl")}
          tone={financialToneClass(summary.total_pnl)}
          value={
            <>
              <FinancialDirectionGlyph direction={totalDirection} />
              {formatSignedMoney(summary.total_pnl, locale)}
            </>
          }
          sub={
            <>
              <FinancialDirectionGlyph direction={returnDirection} />
              {formatPercent(summary.total_return_pct, locale)}
            </>
          }
        />
        <SummaryStat
          icon={RiCoinsLine}
          label={t("portfolio.summary.realizedPnl")}
          tone={financialToneClass(summary.realized_pnl)}
          value={
            <>
              <FinancialDirectionGlyph direction={realizedDirection} />
              {formatSignedMoney(summary.realized_pnl, locale)}
            </>
          }
        />
        <SummaryStat
          icon={RiLineChartLine}
          label={t("portfolio.summary.unrealizedPnl")}
          tone={financialToneClass(summary.unrealized_pnl)}
          value={
            <>
              <FinancialDirectionGlyph direction={unrealizedDirection} />
              {formatSignedMoney(summary.unrealized_pnl, locale)}
            </>
          }
        />
      </div>
    </Card>
  );
}

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
import { StatSurface } from "../../components/application/layout/application-layout";
import { readErrorText } from "./error-text";
import { localeFor } from "../../i18n";
import {
  changeDirection,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from "./format";
import { usePortfolioSummary } from "./usePortfolios";
import { ErrorCard, NoticeCard } from "./ui";
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from "../../components/application/financial-data";
import { cx } from "../../utils/cx";

interface SummaryCardsProps {
  portfolioId: string;
  asOf?: string;
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
  icon: typeof RiFundsLine;
}) {
  return (
    <StatSurface
      label={label}
      icon={icon}
      value={
        <span
          className={cx("truncate tabular-nums", tone ?? "text-text-primary")}
        >
          {value}
        </span>
      }
      supportingText={
        sub ? (
          <span className={cx("truncate tabular-nums", tone)}>{sub}</span>
        ) : undefined
      }
    />
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
            date: asOf || t("portfolio.summary.latestSession"),
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
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-busy="true"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="h-28 animate-pulse rounded-3xl bg-background-secondary-default"
            key={index}
          />
        ))}
      </div>
    );
  }

  const summary = data.data;
  const totalDirection = changeDirection(summary.total_pnl);
  const returnDirection = changeDirection(summary.total_return_pct);
  const realizedDirection = changeDirection(summary.realized_pnl);
  const unrealizedDirection = changeDirection(summary.unrealized_pnl);

  return (
    <section className="relative flex flex-col gap-3" aria-busy={isFetching}>
      {isFetching && (
        <span
          className="absolute inset-x-0 -top-1 h-0.5 animate-pulse bg-button-primary"
          role="status"
          aria-label={t("portfolio.summary.loading")}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon={RiFundsLine}
          label={t("portfolio.summary.totalEquity")}
          value={formatMoney(summary.total_equity, locale)}
        />
        <SummaryCard
          icon={RiWallet3Line}
          label={t("portfolio.summary.cashBalance")}
          value={formatMoney(summary.cash_balance, locale)}
        />
        <SummaryCard
          icon={RiBarChartBoxLine}
          label={t("portfolio.summary.holdingsValue")}
          value={formatMoney(summary.holdings_value, locale)}
        />
        <SummaryCard
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
        <SummaryCard
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
        <SummaryCard
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

      <p className="text-body-2-medium text-text-tertiary">
        {summary.as_of
          ? t("portfolio.summary.asOf", { date: summary.as_of })
          : t("portfolio.summary.noSession")}
      </p>
    </section>
  );
}

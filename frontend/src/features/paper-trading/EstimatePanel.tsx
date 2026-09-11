import { useTranslation } from "react-i18next";
import { localeFor } from "../../i18n";
import { formatMoney, formatSignedMoney } from "./format";
import { OrderEstimate } from "./types";
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  NoticeCard,
  StateMessage,
} from "./ui";
import { toneClass } from "./ui-styles";

interface EstimatePanelProps {
  estimate: OrderEstimate | null;
  isPending: boolean;
  /**
   * True when `estimate` was fetched for a symbol/side/quantity combination
   * that no longer matches the ticket's current fields (point C). The panel
   * still shows the last-known figures rather than blanking them, but flags
   * them as stale — OrderTicket independently gates Confirm on the same
   * hash comparison, so this flag is purely informational here.
   */
  isStale: boolean;
  /** An i18n key from order-messages.ts, or null when there is no error. */
  errorKey: string | null;
}

/** Rate percentages are display-only figures echoed from the API, not a signed change — no +/- sign, unlike format.ts's formatPercent. */
function formatRate(value: number, locale: string): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}%`;
}

// ADR 0008: every figure rendered below is read straight from the estimate
// response. Nothing here is summed, subtracted or otherwise derived.
export function EstimatePanel({
  estimate,
  isPending,
  isStale,
  errorKey,
}: EstimatePanelProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  if (isPending) {
    return (
      <Card busy className="min-h-80">
        <CardHeading title={t("paperTrading.ticket.estimate.title")} />
        <CardProgress label={t("paperTrading.ticket.estimate.loading")} />
        <StateMessage>{t("paperTrading.ticket.estimate.loading")}</StateMessage>
      </Card>
    );
  }

  // A real ApiError from POST .../orders/estimate (404/422/503, §6.1) — the
  // same domain conditions a submitted order can be *rejected* with, worded
  // from the exact same order-messages.ts map so the two paths never say
  // different things about, say, INSUFFICIENT_CASH.
  if (errorKey) {
    return (
      <Card className="min-h-80">
        <CardHeading title={t("paperTrading.ticket.estimate.title")} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <ErrorCard role="alert">{t(errorKey)}</ErrorCard>
        </div>
      </Card>
    );
  }

  if (!estimate) {
    return (
      <Card className="min-h-80">
        <CardHeading
          title={t("paperTrading.ticket.estimate.title")}
          subtitle={t("paperTrading.ticket.estimate.waiting")}
        />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <NoticeCard>{t("paperTrading.ticket.estimate.empty")}</NoticeCard>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeading
        title={t("paperTrading.ticket.estimate.title")}
        subtitle={
          isStale ? undefined : t("paperTrading.ticket.estimate.subtitle")
        }
      />

      {isStale && (
        <p
          className="mx-4 mb-3 rounded-lg bg-status-yellow-background px-3 py-2 text-body-2-medium text-status-yellow-text"
          role="status"
        >
          {t("paperTrading.ticket.estimate.stale")}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
        <div className="flex flex-col gap-0.5 rounded-2xl bg-background-secondary-default p-3">
          <dt className="text-body-medium text-text-secondary">
            {t("paperTrading.ticket.estimate.price")}
          </dt>
          <dd className="text-headline-medium tabular-nums text-text-primary">
            {formatMoney(estimate.price, locale)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-background-secondary-default p-3">
          <dt className="text-body-medium text-text-secondary">
            {t("paperTrading.ticket.estimate.priceAsOf")}
          </dt>
          <dd className="text-headline-medium tabular-nums text-text-primary">
            {estimate.price_as_of}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-background-secondary-default p-3">
          <dt className="text-body-medium text-text-secondary">
            {t("paperTrading.ticket.estimate.settlementDate")}
          </dt>
          <dd className="text-headline-medium tabular-nums text-text-primary">
            {estimate.settlement_date}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-background-secondary-default p-3">
          <dt className="text-body-medium text-text-secondary">
            {t("paperTrading.ticket.estimate.grossConsideration")}
          </dt>
          <dd className="text-headline-medium tabular-nums text-text-primary">
            {formatMoney(estimate.gross_consideration, locale)}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto border-t border-separator-border">
        <table className="bui-table bui-table-sm">
          <thead>
            <tr>
              <th scope="col">
                {t("paperTrading.ticket.estimate.feeColumns.type")}
              </th>
              <th scope="col" className="text-right">
                {t("paperTrading.ticket.estimate.feeColumns.rate")}
              </th>
              <th scope="col" className="text-right">
                {t("paperTrading.ticket.estimate.feeColumns.amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {estimate.fees.map((fee) => (
              <tr key={fee.type}>
                <td>
                  {t(`paperTrading.ticket.estimate.feeTypes.${fee.type}`)}
                </td>
                <td className="text-right tabular-nums">
                  {formatRate(fee.rate_percent, locale)}
                </td>
                <td className="text-right tabular-nums">
                  {formatMoney(fee.amount, locale)}
                </td>
              </tr>
            ))}
            {/* There is no "rate" for a total, so that cell is simply empty
                rather than carrying a placeholder figure. */}
            <tr>
              {/* `.bui-table th` paints the column-header background, which on
                  a row header reads as a stray block mid-table — overridden
                  inline because that rule is more specific than a utility. */}
              <th
                scope="row"
                className="text-text-primary"
                style={{ backgroundColor: "transparent" }}
              >
                {t("paperTrading.ticket.estimate.feeTotal")}
              </th>
              <td />
              <td className="text-right tabular-nums">
                {formatMoney(estimate.fee_total, locale)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-separator-border px-4 py-3">
        <span className="text-body-medium text-text-secondary">
          {t("paperTrading.ticket.estimate.cashEffect")}
        </span>
        <span
          className={`text-headline-medium tabular-nums ${toneClass(estimate.cash_effect)}`}
        >
          {formatSignedMoney(estimate.cash_effect, locale)}
        </span>
      </div>

      <p className="border-t border-separator-border px-4 py-3 text-body-2-regular text-text-tertiary sm:px-5">
        {t("paperTrading.ticket.estimate.explanation")}
      </p>
    </Card>
  );
}

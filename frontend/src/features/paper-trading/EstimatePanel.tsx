import { useTranslation } from "react-i18next";
import { ReactNode } from 'react';
import { localeFor } from "../../i18n";
import { formatDay, formatMoney, formatSignedMoney } from "./format";
import { OrderEstimate } from "./types";
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  StateMessage,
} from "./ui";
import { financialToneClass } from "../../components/application/financial-data";
import { TradingDetails } from './TradingDetails';
import { DetailList, DetailRow } from '../../components/application/detail-list';
import { cx } from '@/utils/cx';

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
  simple?: boolean;
  confirmation?: ReactNode;
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
  simple = false,
  confirmation,
}: EstimatePanelProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  if (isPending) {
    return (
      <Card busy className="h-full min-h-80">
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
      <Card className="h-full min-h-80">
        <CardHeading title={t("paperTrading.ticket.estimate.title")} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <ErrorCard role="alert">{t(errorKey)}</ErrorCard>
        </div>
      </Card>
    );
  }

  if (!estimate) {
    if (simple) return null;
    return (
      <Card className="h-full min-h-80">
        <CardHeading
          title={t("paperTrading.ticket.estimate.title")}
          subtitle={t("paperTrading.ticket.estimate.waiting")}
        />
        <StateMessage>{t("paperTrading.ticket.estimate.empty")}</StateMessage>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeading
        title={t("paperTrading.ticket.estimate.title")}
        subtitle={
          isStale ? undefined : t("paperTrading.ticket.estimate.subtitle")
        }
        info={
          simple
            ? t('paperTrading.workflow.settlementHelp', { date: formatDay(estimate.settlement_date, locale) })
            : t("paperTrading.ticket.estimate.explanation")
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

      {simple && <p className="px-4 pb-4 text-body-medium text-text-primary sm:px-5">
        {t('paperTrading.workflow.reviewSummary', {
          side: t(`paperTrading.ticket.sides.${estimate.side}`),
          quantity: estimate.quantity, symbol: estimate.symbol,
        })}
      </p>}

      <div className="px-4 pb-4 sm:px-5">
        <DetailList>
          <DetailRow
            label={t("paperTrading.ticket.estimate.price")}
            value={formatMoney(estimate.price, locale)}
          />
          <DetailRow
            label={t("paperTrading.ticket.estimate.priceAsOf")}
            value={formatDay(estimate.price_as_of, locale)}
          />
          {!simple && (
            <DetailRow
              label={t("paperTrading.ticket.estimate.settlementDate")}
              value={formatDay(estimate.settlement_date, locale)}
            />
          )}
          <DetailRow
            label={t(simple ? 'paperTrading.workflow.shareValue' : "paperTrading.ticket.estimate.grossConsideration")}
            value={formatMoney(estimate.gross_consideration, locale)}
          />
          {simple && (
            <DetailRow
              label={t('paperTrading.workflow.totalCharges')}
              value={formatMoney(estimate.fee_total, locale)}
            />
          )}
        </DetailList>
      </div>

      <div className="px-4 pb-4 sm:px-5">
      <TradingDetails title={t('paperTrading.workflow.chargeBreakdown')} expanded={!simple}>
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
            {!simple && <tr>
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
            </tr>}
          </tbody>
        </table>
      </div>
      </TradingDetails>
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-separator-border px-4 py-3 sm:flex-row sm:px-5 sm:items-baseline sm:justify-between sm:gap-3">
        <span className="text-body-medium text-text-secondary">
          {t(simple ? `paperTrading.workflow.cashEffect.${estimate.side}` : "paperTrading.ticket.estimate.cashEffect")}
        </span>
        <span
          className={cx('text-headline-medium tabular-nums', financialToneClass(estimate.cash_effect))}
        >
          {formatSignedMoney(estimate.cash_effect, locale)}
        </span>
      </div>

      {simple && (
        <p className="border-t border-separator-border px-4 py-3 text-body-2-regular text-text-secondary sm:px-5">
          {t('paperTrading.workflow.previewWarning')}
        </p>
      )}
      {confirmation && <div className="px-4 pb-4 sm:px-5 sm:pb-5">{confirmation}</div>}
    </Card>
  );
}

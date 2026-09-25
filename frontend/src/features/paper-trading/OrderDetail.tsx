import { useTranslation } from "react-i18next";
import { localeFor } from "../../i18n";
import { readErrorText } from "./error-text";
import {
  changeDirection,
  formatDay,
  formatMoney,
  formatSignedMoney,
} from "./format";
import { useOrder } from "./useOrders";
import { ErrorCard, StateMessage } from "./ui";
import { DetailList, DetailRow } from "../../components/application/detail-list";
import { InfoTip } from "../../components/domain/info-tip";
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from "../../components/application/financial-data";

interface OrderDetailProps {
  portfolioId: string;
  orderId: string;
}

/**
 * The body of one expanded order row. §6.3's list omits `fill` entirely, so
 * this is the one place that pays for §6.4's full GET /orders/:orderId —
 * fetched lazily (useOrder's `enabled: !!orderId`) only once a row is
 * expanded, never for every row up front.
 *
 * §6.4's nested `fill` (unlike the standalone §6.5 fill-list row) carries
 * `fee_total` but not the per-component fee breakdown — there is no `fees[]`
 * on it (see types.ts's `Fill` vs `FillListItem`) — so only the total is
 * shown here. Nothing below is derived: every figure is read straight off
 * the response (ADR 0008).
 */
export function OrderDetail({ portfolioId, orderId }: OrderDetailProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isError, error } = useOrder(portfolioId, orderId);

  if (isPending) {
    return (
      <p className="text-body-medium text-text-secondary" role="status">
        {t("orders.detail.loading")}
      </p>
    );
  }

  if (isError) {
    return (
      <ErrorCard>
        {readErrorText(error, t("orders.detail.unreachable"))}
      </ErrorCard>
    );
  }

  const fill = data?.data.fill;

  // A rejected order (or one whose fill hasn't landed for some other reason)
  // has nothing further to show here — its reason is already rendered
  // inline on the row itself, without needing this fetch.
  if (!fill) {
    return (
      <StateMessage>{t("orders.detail.noFill")}</StateMessage>
    );
  }

  const pnlDirection =
    fill.realized_pnl !== null ? changeDirection(fill.realized_pnl) : "flat";

  return (
    <DetailList
      title={
        <span className="flex items-center gap-1">
          {t("orders.detail.executionTitle")}
          <InfoTip label={t("orders.detail.executionTitle")}>
            {t("orders.detail.executionHelp")}
          </InfoTip>
        </span>
      }
    >
      <DetailRow
        label={t("orders.detail.price")}
        value={formatMoney(fill.price, locale)}
      />
      <DetailRow
        label={t("orders.detail.grossConsideration")}
        value={formatMoney(fill.gross_consideration, locale)}
      />
      <DetailRow
        label={t("orders.detail.feeTotal")}
        value={formatMoney(fill.fee_total, locale)}
      />
      <DetailRow
        label={t("orders.detail.fillDate")}
        value={formatDay(fill.fill_date, locale)}
      />
      <DetailRow
        label={t("orders.detail.settlementDate")}
        value={formatDay(fill.settlement_date, locale)}
      />
      <DetailRow
        className="border-t border-separator-border pt-3 text-body-medium"
        label={t("orders.detail.cashEffect")}
        value={
          <span className={financialToneClass(fill.cash_effect)}>
            {formatSignedMoney(fill.cash_effect, locale)}
          </span>
        }
      />
      {/* realized_pnl is only ever non-null on a sell that closed a FIFO lot
        (§3.3) — a buy's fill always carries `null` here, so this row is
        simply omitted for a buy rather than shown as a meaningless zero. */}
      {fill.realized_pnl !== null && (
        <DetailRow
          className="text-body-medium"
          label={t("orders.detail.realizedPnl")}
          value={
            <span className={financialToneClass(fill.realized_pnl)}>
              <FinancialDirectionGlyph direction={pnlDirection} />
              {formatSignedMoney(fill.realized_pnl, locale)}
            </span>
          }
        />
      )}
    </DetailList>
  );
}

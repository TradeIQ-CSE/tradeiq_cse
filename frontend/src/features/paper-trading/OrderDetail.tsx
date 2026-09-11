import { useTranslation } from "react-i18next";
import { localeFor } from "../../i18n";
import { readErrorText } from "./error-text";
import { changeDirection, formatMoney, formatSignedMoney } from "./format";
import { useOrder } from "./useOrders";
import { DirectionGlyph, ErrorCard } from "./ui";
import { toneClass } from "./ui-styles";

interface OrderDetailProps {
  portfolioId: string;
  orderId: string;
}

function DetailRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-medium text-text-secondary">{term}</dt>
      <dd className="text-body-medium tabular-nums text-text-primary">
        {children}
      </dd>
    </div>
  );
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
      <div className="rounded-2xl bg-background-secondary-default p-4">
        <p className="text-body-medium text-text-secondary">
          {t("orders.detail.noFill")}
        </p>
      </div>
    );
  }

  const pnlDirection =
    fill.realized_pnl !== null ? changeDirection(fill.realized_pnl) : "flat";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-headline-medium text-text-primary">
          {t("orders.detail.executionTitle")}
        </h3>
        <p className="text-body-regular text-text-secondary">
          {t("orders.detail.executionHelp")}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          [t("orders.detail.price"), formatMoney(fill.price, locale)],
          [t("orders.detail.fillDate"), fill.fill_date],
          [t("orders.detail.settlementDate"), fill.settlement_date],
          [
            t("orders.detail.grossConsideration"),
            formatMoney(fill.gross_consideration, locale),
          ],
          [t("orders.detail.feeTotal"), formatMoney(fill.fee_total, locale)],
        ].map(([term, value]) => (
          <div
            className="rounded-2xl bg-background-secondary-default p-3"
            key={term}
          >
            <DetailRow term={term}>{value}</DetailRow>
          </div>
        ))}

        <div className="rounded-2xl bg-background-secondary-default p-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-medium text-text-secondary">
              {t("orders.detail.cashEffect")}
            </dt>
            <dd
              className={`text-body-medium tabular-nums ${toneClass(fill.cash_effect)}`}
            >
              {formatSignedMoney(fill.cash_effect, locale)}
            </dd>
          </div>
        </div>

        {/* realized_pnl is only ever non-null on a sell that closed a FIFO lot
          (§3.3) — a buy's fill always carries `null` here, so this row is
          simply omitted for a buy rather than shown as a meaningless zero. */}
        {fill.realized_pnl !== null && (
          <div className="rounded-2xl bg-background-secondary-default p-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-medium text-text-secondary">
                {t("orders.detail.realizedPnl")}
              </dt>
              <dd
                className={`text-body-medium tabular-nums ${toneClass(fill.realized_pnl)}`}
              >
                <DirectionGlyph direction={pnlDirection} />
                {formatSignedMoney(fill.realized_pnl, locale)}
              </dd>
            </div>
          </div>
        )}
      </dl>
    </div>
  );
}

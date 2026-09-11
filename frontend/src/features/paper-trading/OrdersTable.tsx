import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiEyeLine,
} from "@remixicon/react";
import { ApiError } from "../../lib/api";
import { Button } from "../../components/base/buttons/button";
import { Chip } from "../../components/base/badges/chip";
import { Select, SelectItem } from "../../components/base/select/select";
import { readErrorText } from "./error-text";
import { localeFor } from "../../i18n";
import { formatDateTime, formatQuantity } from "./format";
import { mapOrderCode } from "./order-messages";
import { Order, OrderStatus } from "./types";
import { useOrders } from "./useOrders";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  Pager,
  SkeletonRow,
  StateMessage,
} from "./ui";

interface OrdersTableProps {
  portfolioId: string;
}

type StatusFilter = OrderStatus | "all";

const COLUMN_COUNT = 6;

export function OrdersTable({ portfolioId }: OrdersTableProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Mirrors CashLedger.tsx: this component isn't remounted when the
  // selector switches portfolios, so `page`/`expandedId` would otherwise
  // survive the switch — a stale page number can come back with a smaller
  // `meta.total`, and a stale expanded id would fetch another portfolio's
  // order through this one's `portfolioId`.
  useEffect(() => {
    setPage(1);
    setSelectedOrder(null);
  }, [portfolioId]);

  // Changing the filter is a new result set — the current page number and
  // whatever row happened to be expanded no longer mean anything in it.
  useEffect(() => {
    setPage(1);
    setSelectedOrder(null);
  }, [status]);

  const { data, isPending, isFetching, isError, error } = useOrders(
    portfolioId,
    {
      status: status === "all" ? undefined : status,
      page,
    },
  );

  const total = data?.meta?.total ?? 0;
  const pageSize = data?.meta?.page_size || 1;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.data ?? [];

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
    return (
      <ErrorCard>{readErrorText(error, t("orders.unreachable"))}</ErrorCard>
    );
  }

  return (
    <Card busy={isFetching}>
      {isFetching && <CardProgress label={t("orders.loading")} />}

      <CardHeading
        title={t("orders.tableTitle")}
        actions={
          <div className="flex min-w-44 flex-col gap-1">
            <span className="text-body-2-medium text-text-secondary">
              {t("orders.filter.label")}
            </span>
            <Select
              aria-label={t("orders.filter.label")}
              selectedKey={status}
              onSelectionChange={(key) =>
                setStatus(String(key) as StatusFilter)
              }
            >
              <SelectItem id="all" textValue={t("orders.filter.all")}>
                {t("orders.filter.all")}
              </SelectItem>
              <SelectItem id="filled" textValue={t("orders.status.filled")}>
                {t("orders.status.filled")}
              </SelectItem>
              <SelectItem id="rejected" textValue={t("orders.status.rejected")}>
                {t("orders.status.rejected")}
              </SelectItem>
            </Select>
          </div>
        }
      />

      {!isPending && rows.length === 0 ? (
        <StateMessage>
          {status === "all" ? t("orders.empty") : t("orders.emptyFiltered")}
        </StateMessage>
      ) : (
        <div>
          <p className="border-y border-separator-border px-4 py-2 text-body-2-regular text-text-tertiary sm:hidden">
            {t("orders.scrollHint")}
          </p>
          <div className="overflow-x-auto">
            <table className="bui-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">{t("orders.columns.placedAt")}</th>
                  <th scope="col">{t("orders.columns.symbol")}</th>
                  <th scope="col">{t("orders.columns.side")}</th>
                  <th scope="col" className="text-right">
                    {t("orders.columns.quantity")}
                  </th>
                  <th scope="col">{t("orders.columns.status")}</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">
                      {t("orders.columns.actions")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isPending && !data
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonRow columns={COLUMN_COUNT} key={index} />
                    ))
                  : rows.map((order) => {
                      const quantityText =
                        order.filled_quantity !== order.quantity
                          ? t("orders.quantityPartial", {
                              filled: formatQuantity(
                                order.filled_quantity,
                                locale,
                              ),
                              quantity: formatQuantity(order.quantity, locale),
                            })
                          : formatQuantity(order.quantity, locale);

                      const StatusIcon =
                        order.status === "filled"
                          ? RiCheckboxCircleLine
                          : RiCloseCircleLine;

                      return (
                        <tr key={order.order_id}>
                          <td className="tabular-nums">
                            {formatDateTime(order.placed_at, locale)}
                          </td>
                          <td className="text-text-primary">{order.symbol}</td>
                          <td>
                            {t(`paperTrading.ticket.sides.${order.side}`)}
                          </td>
                          <td className="text-right tabular-nums">
                            {quantityText}
                          </td>
                          <td>
                            <div className="flex flex-col items-start gap-1">
                              <Chip
                                variant="subtle"
                                color={
                                  order.status === "filled" ? "lime" : "rose"
                                }
                                className="gap-1"
                                data-status={order.status}
                              >
                                <StatusIcon className="size-4" aria-hidden />
                                {t(`orders.status.${order.status}`)}
                              </Chip>
                              {/* A rejected order is a persisted, auditable
                                  record, not an error — never branched on
                                  isError, and always worded through the exact
                                  same map the order ticket used at submit
                                  time (order-messages.ts). */}
                              {order.status === "rejected" && (
                                <span
                                  className="text-body-2-medium text-text-tertiary"
                                  role="status"
                                >
                                  {t(
                                    mapOrderCode(
                                      order.rejection_code ?? "INTERNAL",
                                    ),
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="small"
                              leadingIcon={RiEyeLine}
                              onClick={() => setSelectedOrder(order)}
                            >
                              {t("orders.expand")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isError && total > 0 && (
        <Pager
          label={t("orders.pagination.page", {
            page: formatQuantity(page, locale),
            lastPage: formatQuantity(lastPage, locale),
          })}
          previousLabel={t("orders.pagination.previous")}
          nextLabel={t("orders.pagination.next")}
          canGoPrevious={page > 1}
          canGoNext={page < lastPage}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      <OrderDetailDrawer
        portfolioId={portfolioId}
        order={selectedOrder}
        onOpenChange={(isOpen) => !isOpen && setSelectedOrder(null)}
      />
    </Card>
  );
}

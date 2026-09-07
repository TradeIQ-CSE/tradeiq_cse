import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/base/buttons/button';
import { Chip } from '../../components/base/badges/chip';
import { readErrorText } from './error-text';
import { localeFor } from '../../i18n';
import { formatDateTime, formatQuantity } from './format';
import { mapOrderCode } from './order-messages';
import { OrderDetail } from './OrderDetail';
import { OrderStatus } from './types';
import { useOrders } from './useOrders';
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  Field,
  Pager,
  SkeletonRow,
  StateMessage,
} from './ui';
import { fieldShell } from './ui-styles';

interface OrdersTableProps {
  portfolioId: string;
}

type StatusFilter = OrderStatus | 'all';

const COLUMN_COUNT = 6;

export function OrdersTable({ portfolioId }: OrdersTableProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Mirrors CashLedger.tsx: this component isn't remounted when the
  // selector switches portfolios, so `page`/`expandedId` would otherwise
  // survive the switch — a stale page number can come back with a smaller
  // `meta.total`, and a stale expanded id would fetch another portfolio's
  // order through this one's `portfolioId`.
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [portfolioId]);

  // Changing the filter is a new result set — the current page number and
  // whatever row happened to be expanded no longer mean anything in it.
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [status]);

  const { data, isPending, isFetching, isError, error } = useOrders(portfolioId, {
    status: status === 'all' ? undefined : status,
    page,
  });

  const total = data?.meta?.total ?? 0;
  const pageSize = data?.meta?.page_size || 1;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.data ?? [];

  if (isError) {
    if (error instanceof ApiError && error.body.code === 'PORTFOLIO_NOT_FOUND') {
      // The parent's canary (PortfolioScope) is already recovering from this
      // same 404 — render nothing rather than flash the raw backend message
      // before the parent unmounts this component.
      return null;
    }
    return <ErrorCard>{readErrorText(error, t('orders.unreachable'))}</ErrorCard>;
  }

  return (
    <Card busy={isFetching}>
      {isFetching && <CardProgress label={t('orders.loading')} />}

      <CardHeading
        title={t('orders.tableTitle')}
        actions={
          <Field label={t('orders.filter.label')} className="w-auto">
            <select
              className={fieldShell}
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
            >
              <option value="all">{t('orders.filter.all')}</option>
              <option value="filled">{t('orders.status.filled')}</option>
              <option value="rejected">{t('orders.status.rejected')}</option>
            </select>
          </Field>
        }
      />

      {!isPending && rows.length === 0 ? (
        <StateMessage>{status === 'all' ? t('orders.empty') : t('orders.emptyFiltered')}</StateMessage>
      ) : (
        <div className="overflow-x-auto">
          <table className="bui-table">
            <thead>
              <tr>
                <th scope="col">{t('orders.columns.placedAt')}</th>
                <th scope="col">{t('orders.columns.symbol')}</th>
                <th scope="col">{t('orders.columns.side')}</th>
                <th scope="col" className="text-right">
                  {t('orders.columns.quantity')}
                </th>
                <th scope="col">{t('orders.columns.status')}</th>
                <th scope="col" className="text-right">
                  <span className="sr-only">{t('orders.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isPending && !data
                ? Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonRow columns={COLUMN_COUNT} key={index} />
                  ))
                : rows.map((order) => {
                    const isExpanded = expandedId === order.order_id;
                    const panelId = `order-detail-${order.order_id}`;
                    const quantityText =
                      order.filled_quantity !== order.quantity
                        ? t('orders.quantityPartial', {
                            filled: formatQuantity(order.filled_quantity, locale),
                            quantity: formatQuantity(order.quantity, locale),
                          })
                        : formatQuantity(order.quantity, locale);

                    return (
                      <Fragment key={order.order_id}>
                        <tr>
                          <td className="tabular-nums">{formatDateTime(order.placed_at, locale)}</td>
                          <td className="text-text-primary">{order.symbol}</td>
                          <td>{t(`paperTrading.ticket.sides.${order.side}`)}</td>
                          <td className="text-right tabular-nums">{quantityText}</td>
                          <td>
                            <div className="flex flex-col items-start gap-1">
                              <Chip
                                variant="subtle"
                                color={order.status === 'filled' ? 'lime' : 'rose'}
                                data-status={order.status}
                              >
                                {t(`orders.status.${order.status}`)}
                              </Chip>
                              {/* A rejected order is a persisted, auditable
                                  record, not an error — never branched on
                                  isError, and always worded through the exact
                                  same map the order ticket used at submit
                                  time (order-messages.ts). */}
                              {order.status === 'rejected' && (
                                <span className="text-body-2-medium text-text-tertiary" role="status">
                                  {t(mapOrderCode(order.rejection_code ?? 'INTERNAL'))}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="small"
                              aria-expanded={isExpanded}
                              aria-controls={panelId}
                              onClick={() => setExpandedId(isExpanded ? null : order.order_id)}
                            >
                              {isExpanded ? t('orders.collapse') : t('orders.expand')}
                            </Button>
                          </td>
                        </tr>

                        {/* The detail is its own full-width row rather than
                            markup nested inside a cell: an expanded panel
                            spans every column, and a <dl> is not valid inside
                            the inline content of a <td> beside other cells. */}
                        <tr id={panelId} hidden={!isExpanded}>
                          <td colSpan={COLUMN_COUNT} className="bg-background-secondary-default">
                            {isExpanded && (
                              <OrderDetail portfolioId={portfolioId} orderId={order.order_id} />
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {!isError && total > 0 && (
        <Pager
          label={t('orders.pagination.page', {
            page: formatQuantity(page, locale),
            lastPage: formatQuantity(lastPage, locale),
          })}
          previousLabel={t('orders.pagination.previous')}
          nextLabel={t('orders.pagination.next')}
          canGoPrevious={page > 1}
          canGoNext={page < lastPage}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </Card>
  );
}

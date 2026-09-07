import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { readErrorText } from './error-text';
import { localeFor } from '../../i18n';
import { formatDateTime, formatQuantity } from './format';
import { mapOrderCode } from './order-messages';
import { OrderDetail } from './OrderDetail';
import { OrderStatus } from './types';
import { useOrders } from './useOrders';
import './paper-trading.css';

interface OrdersTableProps {
  portfolioId: string;
}

type StatusFilter = OrderStatus | 'all';

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
    return (
      <div className="paper-trading-card paper-trading-card--error">
        {readErrorText(error, t('orders.unreachable'))}
      </div>
    );
  }

  return (
    <div className="paper-trading-card" aria-busy={isFetching}>
      {isFetching && (
        <span
          className="paper-trading-card__progress"
          role="status"
          aria-label={t('orders.loading')}
        />
      )}

      <div className="paper-trading-card__heading">
        <h2>{t('orders.tableTitle')}</h2>
        <label className="orders-filter">
          <span>{t('orders.filter.label')}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">{t('orders.filter.all')}</option>
            <option value="filled">{t('orders.status.filled')}</option>
            <option value="rejected">{t('orders.status.rejected')}</option>
          </select>
        </label>
      </div>

      {!isPending && rows.length === 0 ? (
        <div className="paper-trading-page__state">
          {status === 'all' ? t('orders.empty') : t('orders.emptyFiltered')}
        </div>
      ) : (
        <>
          <div className="orders-row orders-row--head">
            <span>{t('orders.columns.placedAt')}</span>
            <span>{t('orders.columns.symbol')}</span>
            <span>{t('orders.columns.side')}</span>
            <span>{t('orders.columns.quantity')}</span>
            <span>{t('orders.columns.status')}</span>
            <span aria-hidden="true" />
          </div>

          <div className="orders-table__body">
            {isPending && !data
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="orders-row orders-row--skeleton" key={index} />
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
                    <div className="orders-row-group" key={order.order_id}>
                      <div className="orders-row">
                        <span data-label={t('orders.columns.placedAt')}>
                          {formatDateTime(order.placed_at, locale)}
                        </span>
                        <span data-label={t('orders.columns.symbol')}>{order.symbol}</span>
                        <span data-label={t('orders.columns.side')}>
                          {t(`paperTrading.ticket.sides.${order.side}`)}
                        </span>
                        <span data-label={t('orders.columns.quantity')}>{quantityText}</span>
                        <span data-label={t('orders.columns.status')}>
                          <span className={`orders-status-badge orders-status-badge--${order.status}`}>
                            {t(`orders.status.${order.status}`)}
                          </span>
                        </span>
                        <span className="orders-row__expand">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            onClick={() => setExpandedId(isExpanded ? null : order.order_id)}
                          >
                            {isExpanded ? t('orders.collapse') : t('orders.expand')}
                          </button>
                        </span>
                      </div>

                      {/* A rejected order is a persisted, auditable record, not
                          an error — never branched on isError, and always
                          worded through the exact same map the order ticket
                          used at submit time (order-messages.ts). */}
                      {order.status === 'rejected' && (
                        <p className="orders-row__reason" role="status">
                          {t(mapOrderCode(order.rejection_code ?? 'INTERNAL'))}
                        </p>
                      )}

                      <div id={panelId} hidden={!isExpanded}>
                        {isExpanded && (
                          <OrderDetail portfolioId={portfolioId} orderId={order.order_id} />
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </>
      )}

      {!isError && total > 0 && (
        <footer className="paper-trading-page__footer">
          <span>
            {t('orders.pagination.page', {
              page: formatQuantity(page, locale),
              lastPage: formatQuantity(lastPage, locale),
            })}
          </span>
          <div className="paper-trading-page__pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('orders.pagination.previous')}
            </button>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('orders.pagination.next')}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

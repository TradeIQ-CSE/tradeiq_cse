import { useTranslation } from 'react-i18next';
import { localeFor } from '../../i18n';
import { readErrorText } from './error-text';
import { changeDirection, formatMoney, formatSignedMoney } from './format';
import { useOrder } from './useOrders';
import './paper-trading.css';

interface OrderDetailProps {
  portfolioId: string;
  orderId: string;
}

function DirectionGlyph({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'flat') return null;
  return (
    <span className={`direction-glyph direction-glyph--${direction}`} aria-hidden="true">
      {direction === 'up' ? '▲' : '▼'}
    </span>
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
      <div className="order-detail" role="status">
        {t('orders.detail.loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="order-detail paper-trading-card--error">
        {readErrorText(error, t('orders.detail.unreachable'))}
      </div>
    );
  }

  const fill = data?.data.fill;

  // A rejected order (or one whose fill hasn't landed for some other reason)
  // has nothing further to show here — its reason is already rendered
  // inline on the row itself, without needing this fetch.
  if (!fill) {
    return <div className="order-detail">{t('orders.detail.noFill')}</div>;
  }

  const pnlDirection = fill.realized_pnl !== null ? changeDirection(fill.realized_pnl) : 'flat';

  return (
    <dl className="order-detail">
      <div className="order-detail__row">
        <dt>{t('orders.detail.price')}</dt>
        <dd>{formatMoney(fill.price, locale)}</dd>
      </div>
      <div className="order-detail__row">
        <dt>{t('orders.detail.fillDate')}</dt>
        <dd>{fill.fill_date}</dd>
      </div>
      <div className="order-detail__row">
        <dt>{t('orders.detail.settlementDate')}</dt>
        <dd>{fill.settlement_date}</dd>
      </div>
      <div className="order-detail__row">
        <dt>{t('orders.detail.grossConsideration')}</dt>
        <dd>{formatMoney(fill.gross_consideration, locale)}</dd>
      </div>
      <div className="order-detail__row">
        <dt>{t('orders.detail.feeTotal')}</dt>
        <dd>{formatMoney(fill.fee_total, locale)}</dd>
      </div>
      <div className="order-detail__row">
        <dt>{t('orders.detail.cashEffect')}</dt>
        <dd className={fill.cash_effect < 0 ? 'negative-text' : 'positive-text'}>
          {formatSignedMoney(fill.cash_effect, locale)}
        </dd>
      </div>
      {/* realized_pnl is only ever non-null on a sell that closed a FIFO lot
          (§3.3) — a buy's fill always carries `null` here, so this row is
          simply omitted for a buy rather than shown as a meaningless zero. */}
      {fill.realized_pnl !== null && (
        <div className="order-detail__row">
          <dt>{t('orders.detail.realizedPnl')}</dt>
          <dd className={fill.realized_pnl < 0 ? 'negative-text' : 'positive-text'}>
            <DirectionGlyph direction={pnlDirection} />
            {formatSignedMoney(fill.realized_pnl, locale)}
          </dd>
        </div>
      )}
    </dl>
  );
}

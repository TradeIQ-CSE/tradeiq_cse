import { useTranslation } from 'react-i18next';
import { RiCheckboxCircleFill, RiErrorWarningFill } from '@remixicon/react';
import { localeFor } from '../../i18n';
import { formatMoney, formatSignedMoney } from './format';
import { mapOrderCode } from './order-messages';
import { Order } from './types';
import { ErrorCard } from './ui';

/**
 * The one shared banner for every outcome of a submitted order. Point A is
 * the entire reason this is its own component rather than three ad-hoc
 * blocks in OrderTicket: a rejected order (`kind: 'rejected'`) is a
 * SUCCESSFUL, persisted submission — `filled` and `rejected` both render
 * with `role="status"` and are driven off `Order.status`, never off a
 * mutation's `isError`. Only `kind: 'error'` is a genuine `ApiError` (the
 * submission itself never reached a persisted order — 400/409/503, §6.2) and
 * gets `role="alert"` and the error treatment.
 */
export type OrderResultOutcome =
  | { kind: 'filled'; order: Order }
  | { kind: 'rejected'; order: Order }
  | { kind: 'error'; messageKey: string };

interface ResultBannerProps {
  outcome: OrderResultOutcome;
}

export function ResultBanner({ outcome }: ResultBannerProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  if (outcome.kind === 'error') {
    return <ErrorCard role="alert">{t(outcome.messageKey)}</ErrorCard>;
  }

  const { order } = outcome;

  if (outcome.kind === 'filled' && order.fill) {
    return (
      <div
        className="flex items-start gap-3 rounded-2xl bg-status-lime-background px-4 py-3 text-status-lime-text"
        role="status"
      >
        <RiCheckboxCircleFill className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="text-body-medium">
            {t('paperTrading.ticket.result.filledTitle', {
              side: t(`paperTrading.ticket.sides.${order.side}`),
              quantity: order.filled_quantity,
              symbol: order.symbol,
            })}
          </p>
          {/* ADR 0008: price and cash_effect are the fill's verbatim fields. */}
          <p className="text-body-2-medium">
            {t('paperTrading.ticket.result.filledDetail', {
              price: formatMoney(order.fill.price, locale),
              cashEffect: formatSignedMoney(order.fill.cash_effect, locale),
              date: order.fill.settlement_date,
            })}
          </p>
        </div>
      </div>
    );
  }

  // Rejected: a well-formed order that failed a domain check (§6.2/§9.2) —
  // warning treatment, never the error styling above, and the copy says the
  // order was recorded rather than implying nothing happened.
  return (
    <div
      className="flex items-start gap-3 rounded-2xl bg-status-yellow-background px-4 py-3 text-status-yellow-text"
      role="status"
    >
      <RiErrorWarningFill className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p className="text-body-medium">
          {t('paperTrading.ticket.result.rejectedTitle', { symbol: order.symbol })}
        </p>
        <p className="text-body-2-medium">{t(mapOrderCode(order.rejection_code ?? 'INTERNAL'))}</p>
        <p className="text-caption-1-medium opacity-80">
          {t('paperTrading.ticket.result.recorded')}
        </p>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { localeFor } from '../../i18n';
import { formatMoney, formatSignedMoney } from './format';
import { OrderEstimate } from './types';
import './paper-trading.css';

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
export function EstimatePanel({ estimate, isPending, isStale, errorKey }: EstimatePanelProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  if (isPending) {
    return (
      <div className="paper-trading-card estimate-panel" aria-busy="true">
        <span
          className="paper-trading-card__progress"
          role="status"
          aria-label={t('paperTrading.ticket.estimate.loading')}
        />
        <p className="paper-trading-page__state">{t('paperTrading.ticket.estimate.loading')}</p>
      </div>
    );
  }

  // A real ApiError from POST .../orders/estimate (404/422/503, §6.1) — the
  // same domain conditions a submitted order can be *rejected* with, worded
  // from the exact same order-messages.ts map so the two paths never say
  // different things about, say, INSUFFICIENT_CASH.
  if (errorKey) {
    return (
      <div className="paper-trading-card paper-trading-card--error estimate-panel" role="alert">
        {t(errorKey)}
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="paper-trading-card paper-trading-card--notice estimate-panel">
        {t('paperTrading.ticket.estimate.empty')}
      </div>
    );
  }

  return (
    <div className="paper-trading-card estimate-panel">
      {isStale && (
        <p className="estimate-panel__stale" role="status">
          {t('paperTrading.ticket.estimate.stale')}
        </p>
      )}

      <div className="paper-trading-card__heading">
        <h2>{t('paperTrading.ticket.estimate.title')}</h2>
      </div>

      <dl className="estimate-panel__summary">
        <div className="estimate-panel__summary-row">
          <dt>{t('paperTrading.ticket.estimate.price')}</dt>
          <dd>{formatMoney(estimate.price, locale)}</dd>
        </div>
        <div className="estimate-panel__summary-row">
          <dt>{t('paperTrading.ticket.estimate.priceAsOf')}</dt>
          <dd>{estimate.price_as_of}</dd>
        </div>
        <div className="estimate-panel__summary-row">
          <dt>{t('paperTrading.ticket.estimate.settlementDate')}</dt>
          <dd>{estimate.settlement_date}</dd>
        </div>
        <div className="estimate-panel__summary-row">
          <dt>{t('paperTrading.ticket.estimate.grossConsideration')}</dt>
          <dd>{formatMoney(estimate.gross_consideration, locale)}</dd>
        </div>
      </dl>

      <div className="estimate-panel__fees">
        <div className="estimate-row estimate-row--head">
          <span>{t('paperTrading.ticket.estimate.feeColumns.type')}</span>
          <span>{t('paperTrading.ticket.estimate.feeColumns.rate')}</span>
          <span>{t('paperTrading.ticket.estimate.feeColumns.amount')}</span>
        </div>

        {estimate.fees.map((fee) => (
          <div className="estimate-row" key={fee.type}>
            <span data-label={t('paperTrading.ticket.estimate.feeColumns.type')}>
              {t(`paperTrading.ticket.estimate.feeTypes.${fee.type}`)}
            </span>
            <span data-label={t('paperTrading.ticket.estimate.feeColumns.rate')}>
              {formatRate(fee.rate_percent, locale)}
            </span>
            <span data-label={t('paperTrading.ticket.estimate.feeColumns.amount')}>
              {formatMoney(fee.amount, locale)}
            </span>
          </div>
        ))}

        {/* Only two cells here — there is no "rate" for a total. The amount
            is placed in the desktop grid's third column via CSS
            (.estimate-row--total in paper-trading.css) rather than by
            rendering an empty middle <span>, which would collapse to a
            blank line in the stacked mobile layout below 480px. */}
        <div className="estimate-row estimate-row--total">
          <span data-label={t('paperTrading.ticket.estimate.feeColumns.type')}>
            {t('paperTrading.ticket.estimate.feeTotal')}
          </span>
          <span data-label={t('paperTrading.ticket.estimate.feeColumns.amount')}>
            {formatMoney(estimate.fee_total, locale)}
          </span>
        </div>
      </div>

      <div className="estimate-panel__cash-effect">
        <span>{t('paperTrading.ticket.estimate.cashEffect')}</span>
        <span className={estimate.cash_effect < 0 ? 'negative-text' : 'positive-text'}>
          {formatSignedMoney(estimate.cash_effect, locale)}
        </span>
      </div>
    </div>
  );
}

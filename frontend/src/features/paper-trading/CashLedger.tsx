import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { readErrorText } from './error-text';
import { localeFor } from '../../i18n';
import { formatMoney, formatQuantity, formatSignedMoney } from './format';
import { useCashTransactions } from './usePortfolios';
import './paper-trading.css';

interface CashLedgerProps {
  portfolioId: string;
}

export function CashLedger({ portfolioId }: CashLedgerProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [page, setPage] = useState(1);

  // This component isn't remounted when the selector switches portfolios
  // (see usePortfolios.ts's useCashTransactions), so `page` would otherwise
  // survive the switch: a request for portfolio B's page 3 can come back
  // with a smaller `meta.total`, leaving the footer reading "Page 3 of 1".
  useEffect(() => {
    setPage(1);
  }, [portfolioId]);

  const { data, isPending, isFetching, isError, error } = useCashTransactions(portfolioId, page);

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
        {readErrorText(error, t('portfolio.cashLedger.unreachable'))}
      </div>
    );
  }

  return (
    <div className="paper-trading-card" aria-busy={isFetching}>
      {isFetching && (
        <span
          className="paper-trading-card__progress"
          role="status"
          aria-label={t('portfolio.cashLedger.loading')}
        />
      )}

      <h2>{t('portfolio.cashLedger.title')}</h2>

      {!isPending && rows.length === 0 ? (
        <div className="paper-trading-page__state">{t('portfolio.cashLedger.empty')}</div>
      ) : (
        <>
          <div className="cash-ledger-row cash-ledger-row--head">
            <span>{t('portfolio.cashLedger.columns.type')}</span>
            <span>{t('portfolio.cashLedger.columns.amount')}</span>
            <span>{t('portfolio.cashLedger.columns.balanceAfter')}</span>
            <span>{t('portfolio.cashLedger.columns.effectiveDate')}</span>
          </div>

          <div className="cash-ledger__body">
            {isPending && !data
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="cash-ledger-row cash-ledger-row--skeleton" key={index} />
                ))
              : rows.map((transaction) => (
                  <div className="cash-ledger-row" key={transaction.transaction_id}>
                    <span data-label={t('portfolio.cashLedger.columns.type')}>
                      {t(`portfolio.cashLedger.types.${transaction.type}`)}
                    </span>
                    <span
                      className={
                        transaction.amount >= 0 ? 'positive-text' : 'negative-text'
                      }
                      data-label={t('portfolio.cashLedger.columns.amount')}
                    >
                      {formatSignedMoney(transaction.amount, locale)}
                    </span>
                    <span data-label={t('portfolio.cashLedger.columns.balanceAfter')}>
                      {formatMoney(transaction.balance_after, locale)}
                    </span>
                    <span data-label={t('portfolio.cashLedger.columns.effectiveDate')}>
                      {transaction.effective_date}
                    </span>
                  </div>
                ))}
          </div>
        </>
      )}

      {!isError && total > 0 && (
        <footer className="paper-trading-page__footer">
          <span>
            {t('portfolio.cashLedger.pagination.page', {
              page: formatQuantity(page, locale),
              lastPage: formatQuantity(lastPage, locale),
            })}
          </span>
          <div className="paper-trading-page__pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('portfolio.cashLedger.pagination.previous')}
            </button>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('portfolio.cashLedger.pagination.next')}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

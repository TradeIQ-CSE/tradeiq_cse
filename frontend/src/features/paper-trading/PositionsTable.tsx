import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { localeFor } from '../../i18n';
import { changeDirection, formatMoney, formatPercent, formatQuantity, formatSignedMoney } from './format';
import { usePositions } from './usePortfolios';
import './paper-trading.css';

interface PositionsTableProps {
  portfolioId: string;
  asOf?: string;
}

function DirectionGlyph({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'flat') return null;
  return (
    <span className={`direction-glyph direction-glyph--${direction}`} aria-hidden="true">
      {direction === 'up' ? '▲' : '▼'}
    </span>
  );
}

export function PositionsTable({ portfolioId, asOf }: PositionsTableProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isFetching, isError, error } = usePositions(portfolioId, asOf);

  if (isError) {
    if (error instanceof ApiError && error.body.code === 'PORTFOLIO_NOT_FOUND') {
      // The parent's canary (PortfolioScope) is already recovering from this
      // same 404 — render nothing rather than flash the raw backend message
      // before the parent unmounts this component.
      return null;
    }
    // §3.4: a held symbol with no close on the effective session fails the
    // whole response, not just that row — there is no partial positions
    // list to fall back to, and the date is never one the user can retry
    // into working, so the recovery copy names it and points at the picker
    // instead of rendering an empty table.
    if (error instanceof ApiError && error.body.code === 'PRICE_UNAVAILABLE') {
      return (
        <div className="paper-trading-card paper-trading-card--notice">
          {t('portfolio.positions.priceUnavailable', {
            date: asOf || t('portfolio.summary.latestSession'),
          })}
        </div>
      );
    }
    return (
      <div className="paper-trading-card paper-trading-card--error">
        {error instanceof ApiError ? error.body.message : t('portfolio.positions.unreachable')}
      </div>
    );
  }

  const rows = data?.data ?? [];
  const resolvedAsOf = data?.meta?.as_of ?? null;

  return (
    <div className="paper-trading-card" aria-busy={isFetching}>
      {isFetching && (
        <span
          className="paper-trading-card__progress"
          role="status"
          aria-label={t('portfolio.positions.loading')}
        />
      )}

      <div className="paper-trading-card__heading">
        <h2>{t('portfolio.positions.title')}</h2>
        {resolvedAsOf && (
          <span className="paper-trading-card__subtitle">
            {t('portfolio.summary.asOf', { date: resolvedAsOf })}
          </span>
        )}
      </div>

      {!isPending && rows.length === 0 ? (
        <div className="paper-trading-page__state">{t('portfolio.positions.empty')}</div>
      ) : (
        <>
          <div className="positions-row positions-row--head">
            <span>{t('portfolio.positions.columns.symbol')}</span>
            <span>{t('portfolio.positions.columns.quantity')}</span>
            <span>{t('portfolio.positions.columns.averageCost')}</span>
            <span>{t('portfolio.positions.columns.price')}</span>
            <span>{t('portfolio.positions.columns.marketValue')}</span>
            <span>{t('portfolio.positions.columns.unrealizedPnl')}</span>
            <span>{t('portfolio.positions.columns.unrealizedReturnPct')}</span>
          </div>

          <div className="positions-table__body">
            {isPending && !data
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div className="positions-row positions-row--skeleton" key={index} />
                ))
              : rows.map((position) => {
                  const direction = changeDirection(position.unrealized_pnl);
                  return (
                    <div className="positions-row" key={position.symbol}>
                      <span data-label={t('portfolio.positions.columns.symbol')}>
                        {position.symbol}
                      </span>
                      <span data-label={t('portfolio.positions.columns.quantity')}>
                        {formatQuantity(position.quantity, locale)}
                      </span>
                      <span data-label={t('portfolio.positions.columns.averageCost')}>
                        {formatMoney(position.average_cost, locale)}
                      </span>
                      <span data-label={t('portfolio.positions.columns.price')}>
                        {formatMoney(position.price, locale)}
                      </span>
                      <span data-label={t('portfolio.positions.columns.marketValue')}>
                        {formatMoney(position.market_value, locale)}
                      </span>
                      <span
                        className={`positions-row__pnl positions-row__pnl--${direction}`}
                        data-label={t('portfolio.positions.columns.unrealizedPnl')}
                      >
                        <DirectionGlyph direction={direction} />
                        {formatSignedMoney(position.unrealized_pnl, locale)}
                      </span>
                      <span
                        className={`positions-row__pnl positions-row__pnl--${direction}`}
                        data-label={t('portfolio.positions.columns.unrealizedReturnPct')}
                      >
                        <DirectionGlyph direction={direction} />
                        {formatPercent(position.unrealized_return_pct, locale)}
                      </span>
                    </div>
                  );
                })}
          </div>
        </>
      )}
    </div>
  );
}

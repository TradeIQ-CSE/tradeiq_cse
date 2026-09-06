import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { readErrorText } from './error-text';
import { localeFor } from '../../i18n';
import { changeDirection, formatMoney, formatPercent, formatSignedMoney } from './format';
import { usePortfolioSummary } from './usePortfolios';
import './paper-trading.css';

interface SummaryCardsProps {
  portfolioId: string;
  asOf?: string;
}

// Kept local and unexported rather than shared: SummaryCards and
// PositionsTable each render this two-glyph indicator, and a shared helper
// module for something this small isn't worth a new file.
function DirectionGlyph({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'flat') return null;
  return (
    <span className={`direction-glyph direction-glyph--${direction}`} aria-hidden="true">
      {direction === 'up' ? '▲' : '▼'}
    </span>
  );
}

// ADR 0008: every figure here is read straight from the API response. No
// value on this page is derived by summing or subtracting other fields.
export function SummaryCards({ portfolioId, asOf }: SummaryCardsProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isFetching, isError, error } = usePortfolioSummary(portfolioId, asOf);

  if (isError) {
    if (error instanceof ApiError && error.body.code === 'PRICE_UNAVAILABLE') {
      return (
        <div className="paper-trading-card paper-trading-card--notice">
          {t('portfolio.summary.priceUnavailable', {
            date: asOf || t('portfolio.summary.latestSession'),
          })}
        </div>
      );
    }
    return (
      <div className="paper-trading-card paper-trading-card--error">
        {readErrorText(error, t('portfolio.summary.unreachable'))}
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <div className="summary-cards" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="summary-card summary-card--skeleton" key={index} />
        ))}
      </div>
    );
  }

  const summary = data.data;
  const totalDirection = changeDirection(summary.total_pnl);
  const returnDirection = changeDirection(summary.total_return_pct);
  const realizedDirection = changeDirection(summary.realized_pnl);
  const unrealizedDirection = changeDirection(summary.unrealized_pnl);

  return (
    <div className="summary-cards" aria-busy={isFetching}>
      {isFetching && (
        <span
          className="summary-cards__progress"
          role="status"
          aria-label={t('portfolio.summary.loading')}
        />
      )}

      <div className="summary-card">
        <span className="summary-card__label">{t('portfolio.summary.totalEquity')}</span>
        <span className="summary-card__value">{formatMoney(summary.total_equity, locale)}</span>
      </div>

      <div className="summary-card">
        <span className="summary-card__label">{t('portfolio.summary.cashBalance')}</span>
        <span className="summary-card__value">{formatMoney(summary.cash_balance, locale)}</span>
      </div>

      <div className="summary-card">
        <span className="summary-card__label">{t('portfolio.summary.holdingsValue')}</span>
        <span className="summary-card__value">{formatMoney(summary.holdings_value, locale)}</span>
      </div>

      <div className={`summary-card summary-card--${totalDirection}`}>
        <span className="summary-card__label">{t('portfolio.summary.totalPnl')}</span>
        <span className="summary-card__value">
          <DirectionGlyph direction={totalDirection} />
          {formatSignedMoney(summary.total_pnl, locale)}
        </span>
        <span className="summary-card__sub">
          <DirectionGlyph direction={returnDirection} />
          {formatPercent(summary.total_return_pct, locale)}
        </span>
      </div>

      <div className={`summary-card summary-card--${realizedDirection}`}>
        <span className="summary-card__label">{t('portfolio.summary.realizedPnl')}</span>
        <span className="summary-card__value">
          <DirectionGlyph direction={realizedDirection} />
          {formatSignedMoney(summary.realized_pnl, locale)}
        </span>
      </div>

      <div className={`summary-card summary-card--${unrealizedDirection}`}>
        <span className="summary-card__label">{t('portfolio.summary.unrealizedPnl')}</span>
        <span className="summary-card__value">
          <DirectionGlyph direction={unrealizedDirection} />
          {formatSignedMoney(summary.unrealized_pnl, locale)}
        </span>
      </div>

      <div className="summary-cards__asof">
        {summary.as_of
          ? t('portfolio.summary.asOf', { date: summary.as_of })
          : t('portfolio.summary.noSession')}
      </div>
    </div>
  );
}

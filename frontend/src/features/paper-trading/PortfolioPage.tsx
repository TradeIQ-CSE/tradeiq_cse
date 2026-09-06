import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CashLedger } from './CashLedger';
import { PortfolioScope } from './PortfolioScope';
import { PositionsTable } from './PositionsTable';
import { SummaryCards } from './SummaryCards';
import { useTradingDateBounds } from './useTradingDateBounds';
import './paper-trading.css';

export function PortfolioPage() {
  const { t } = useTranslation();
  // Empty string means "latest available session", mirroring
  // MarketsPage.tsx's trading-date control and useSecurities' `|| undefined`
  // normalization — an empty as_of must never reach the API as `?as_of=`.
  const [selectedAsOf, setSelectedAsOf] = useState<string>('');
  const { availableFrom, availableTo } = useTradingDateBounds();

  // No AppShell here: AppRoutes' ConsoleRoute already wraps every console page
  // in it, and mounting a second one would nest the sidebar inside itself.
  return (
    <div className="portfolio-page">
      <header className="portfolio-page__header">
        <h1>{t('portfolio.title')}</h1>
        <label className="portfolio-page__date">
          <span>{t('portfolio.asOfLabel')}</span>
          <input
            type="date"
            className="portfolio-select"
            value={selectedAsOf}
            min={availableFrom}
            max={availableTo}
            onChange={(event) => setSelectedAsOf(event.target.value)}
          />
        </label>
      </header>

      <PortfolioScope>
        {(portfolioId) => (
          <>
            <SummaryCards portfolioId={portfolioId} asOf={selectedAsOf || undefined} />
            <PositionsTable portfolioId={portfolioId} asOf={selectedAsOf || undefined} />
            <CashLedger portfolioId={portfolioId} />
          </>
        )}
      </PortfolioScope>
    </div>
  );
}

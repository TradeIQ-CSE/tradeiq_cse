import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CashLedger } from './CashLedger';
import { PortfolioScope } from './PortfolioScope';
import { PositionsTable } from './PositionsTable';
import { SummaryCards } from './SummaryCards';
import { useTradingDateBounds } from './useTradingDateBounds';
import { Field } from './ui';
import { fieldShell } from './ui-styles';

export function PortfolioPage() {
  const { t } = useTranslation();
  // Empty string means "latest available session", mirroring
  // MarketsPage.tsx's trading-date control and useSecurities' `|| undefined`
  // normalization — an empty as_of must never reach the API as `?as_of=`.
  const [selectedAsOf, setSelectedAsOf] = useState<string>('');
  const { availableFrom, availableTo } = useTradingDateBounds();

  // No AppShell here: AppRoutes' ConsoleShellLayout already wraps every
  // console page in it, and mounting a second one would nest the sidebar
  // inside itself.
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title-1-medium text-text-primary">{t('portfolio.title')}</h1>
          <p className="text-body-2-medium text-text-tertiary">{t('portfolio.subtitle')}</p>
        </div>
        <Field label={t('portfolio.asOfLabel')} className="w-auto">
          <input
            type="date"
            className={fieldShell}
            value={selectedAsOf}
            min={availableFrom}
            max={availableTo}
            onChange={(event) => setSelectedAsOf(event.target.value)}
          />
        </Field>
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

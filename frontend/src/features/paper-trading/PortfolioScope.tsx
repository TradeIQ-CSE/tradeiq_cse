import { ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api';
import { CreatePortfolioForm } from './CreatePortfolioForm';
import { PortfolioSelector } from './PortfolioSelector';
import * as queryKeys from './queryKeys';
import { usePortfolioSummary, usePortfolios } from './usePortfolios';
import { useSelectedPortfolio } from './useSelectedPortfolio';
import './paper-trading.css';

interface PortfolioScopeProps {
  children: (portfolioId: string) => ReactNode;
}

/**
 * Resolves the active portfolio for a portfolio-scoped route and renders the
 * shared selector chrome around whatever that route wants to show. This will
 * also wrap /paper-trading and /orders once they exist, so it stays free of
 * anything specific to the portfolio overview page itself (summary cards,
 * positions, ledger).
 */
export function PortfolioScope({ children }: PortfolioScopeProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const portfoliosQuery = usePortfolios();
  const portfolios = portfoliosQuery.data?.data ?? [];
  const { portfolioId, selectPortfolio, clearSelection } = useSelectedPortfolio(portfolios);
  const [creating, setCreating] = useState(false);

  // Ids the canary has rejected this session. useSelectedPortfolio keeps its
  // own equivalent set internally but doesn't expose it, and the render path
  // below needs to tell "no selectable portfolio left" apart from "list still
  // has candidates" without waiting on the invalidated `portfolios()` query
  // (below) to refetch.
  const rejectedIds = useRef<Set<string>>(new Set());

  // Canary query: any portfolio-scoped fetch can 404 when the selected id is
  // stale (deleted elsewhere, or left over in localStorage from a previous
  // account). Summary shares its query key with SummaryCards' own fetch, so
  // this costs no extra request in the common case — its data is never
  // rendered here. TanStack Query v5 removed the `onError` query option, so
  // recovery has to be driven from query state in an effect, same as every
  // other derived-UI branch in this codebase.
  const canary = usePortfolioSummary(portfolioId);

  useEffect(() => {
    if (!canary.isError) return;
    if (canary.error instanceof ApiError && canary.error.body.code === 'PORTFOLIO_NOT_FOUND') {
      // Naming the rejected id matters: a portfolio deleted in another tab can
      // still sit in this tab's cached list, and clearing without it would let
      // the fallback re-select the same id and spin.
      if (portfolioId) rejectedIds.current.add(portfolioId);
      clearSelection(portfolioId);
      // `usePortfolios` has no explicit staleTime (main.tsx's global default
      // applies), so the cached list can still hold an id deleted in another
      // tab. Without invalidating it here, that phantom entry never leaves
      // the selector even after the fallback above has moved past it.
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolios() });
    }
  }, [canary.isError, canary.error, clearSelection, portfolioId, queryClient]);

  if (portfoliosQuery.isPending) {
    return <div className="portfolio-scope__state">{t('portfolio.scope.loading')}</div>;
  }

  if (portfoliosQuery.isError) {
    return (
      <div className="portfolio-scope__state portfolio-scope__state--error">
        {portfoliosQuery.error instanceof ApiError
          ? portfoliosQuery.error.body.message
          : t('portfolio.scope.unreachable')}
      </div>
    );
  }

  const hasSelectablePortfolio = portfolios.some(
    (portfolio) => !rejectedIds.current.has(portfolio.portfolio_id),
  );
  // A non-empty list where every entry has been rejected by the canary is a
  // dead end distinct from "no portfolios exist": with no un-rejected
  // candidate, `portfolioId` stays null forever and `portfolioId &&
  // children(portfolioId)` below would render nothing at all.
  const noSelectablePortfolio = portfolios.length > 0 && !hasSelectablePortfolio;
  const showCreateForm = creating || portfolios.length === 0 || noSelectablePortfolio;

  return (
    <div className="portfolio-scope">
      {portfolios.length > 0 && (
        <PortfolioSelector
          portfolios={portfolios}
          selectedId={portfolioId}
          onSelect={(id) => {
            selectPortfolio(id);
            setCreating(false);
          }}
          onCreateNew={() => setCreating(true)}
        />
      )}

      {showCreateForm ? (
        <div className="portfolio-scope__empty">
          {portfolios.length === 0 && <p>{t('portfolio.scope.empty')}</p>}
          {noSelectablePortfolio && <p>{t('portfolio.scope.unavailable')}</p>}
          <CreatePortfolioForm
            onCreated={(portfolio) => {
              rejectedIds.current.delete(portfolio.portfolio_id);
              selectPortfolio(portfolio.portfolio_id);
              setCreating(false);
            }}
          />
        </div>
      ) : (
        portfolioId && children(portfolioId)
      )}
    </div>
  );
}

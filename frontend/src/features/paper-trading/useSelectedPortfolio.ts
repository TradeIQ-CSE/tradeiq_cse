// Resolves the active portfolio across the flat, portfolio-scoped routes
// (/portfolio, and later /paper-trading, /orders). The URL's `?portfolioId=`
// is the source of truth so a link or refresh reproduces the same view;
// localStorage only seeds it once for a returning visitor, matching the
// tradeiq.language convention in src/i18n/index.ts.

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY = 'tradeiq.selectedPortfolioId';
const PARAM_NAME = 'portfolioId';

// A private window or blocked site data throws on any localStorage access,
// not just on read/write of a missing key, so every call is wrapped here
// once rather than at each call site.
function readStoredPortfolioId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredPortfolioId(portfolioId: string | null): void {
  try {
    if (portfolioId) window.localStorage.setItem(STORAGE_KEY, portfolioId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Selection still works for this tab via the URL param; it just won't
    // survive a reload.
  }
}

export interface SelectedPortfolio {
  portfolioId: string | null;
  selectPortfolio: (portfolioId: string) => void;
  clearSelection: (rejectedPortfolioId?: string | null) => void;
}

/**
 * `portfolios` is the caller's already-loaded `GET /portfolios` list (or
 * `undefined` while it is still loading) — this hook has no query of its own,
 * so the first-row fallback needs it passed in. Resolution order:
 * `?portfolioId=` -> localStorage -> first row of `portfolios` -> none.
 */
export function useSelectedPortfolio(
  portfolios?: { portfolio_id: string }[],
): SelectedPortfolio {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramPortfolioId = searchParams.get(PARAM_NAME);

  // Ids the caller has told us came back 404. Without this, clearing a
  // rejected id that is still present in a stale `portfolios` list would let
  // the fallback below immediately re-select it, 404 again, and spin.
  const rejected = useRef<Set<string>>(new Set());

  // The last portfolio the user picked outright, written synchronously at the
  // moment of the pick. A 404-recovery effect committed while A was selected
  // can still flush *after* the user has moved to B: React 18 flushes pending
  // passive effects before it renders the next update, and that effect's
  // closure — along with `paramPortfolioId` and `searchParams` — is pinned to
  // A. Clearing on that path would throw away B and wipe the stored id, so
  // `clearSelection` compares against this instead of anything it closes over.
  const lastExplicitSelection = useRef<string | null>(null);

  const setParam = useCallback(
    (portfolioId: string | null) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (portfolioId) next.set(PARAM_NAME, portfolioId);
          else next.delete(PARAM_NAME);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (paramPortfolioId) return; // URL is already canonical.
    const stored = readStoredPortfolioId();
    const fallback =
      (stored && !rejected.current.has(stored) ? stored : null) ??
      portfolios?.find((portfolio) => !rejected.current.has(portfolio.portfolio_id))
        ?.portfolio_id;
    if (!fallback) return;
    setParam(fallback);
  }, [paramPortfolioId, portfolios, setParam]);

  const selectPortfolio = useCallback(
    (portfolioId: string) => {
      // An explicit pick clears any earlier rejection: the user may well be
      // choosing a portfolio that has since come back.
      rejected.current.delete(portfolioId);
      lastExplicitSelection.current = portfolioId;
      writeStoredPortfolioId(portfolioId);
      setParam(portfolioId);
    },
    [setParam],
  );

  const clearSelection = useCallback(
    (rejectedPortfolioId?: string | null) => {
      // The id really was rejected, so record it either way — the fallback
      // must not re-pick it even when this call turns out to be stale.
      if (rejectedPortfolioId) rejected.current.add(rejectedPortfolioId);

      // Stale call: the user has since chosen a different portfolio, and that
      // choice outranks a 404 raised against the one they left.
      if (
        rejectedPortfolioId &&
        lastExplicitSelection.current &&
        lastExplicitSelection.current !== rejectedPortfolioId
      ) {
        return;
      }

      lastExplicitSelection.current = null;
      writeStoredPortfolioId(null);
      setParam(null);
    },
    [setParam],
  );

  return { portfolioId: paramPortfolioId, selectPortfolio, clearSelection };
}

import { createElement, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectedPortfolio } from './useSelectedPortfolio';

// Plain .ts (not .tsx), so the wrapper is built with createElement rather
// than JSX — same convention as features/markets/useSecurities.test.ts.
function wrapperFor(initialEntry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries: [initialEntry] }, children);
  };
}

const STORAGE_KEY = 'tradeiq.selectedPortfolioId';
const portfolios = [{ portfolio_id: 'A' }, { portfolio_id: 'B' }];

beforeEach(() => {
  window.localStorage.clear();
});

describe('useSelectedPortfolio', () => {
  // Only A exists, so nothing is left for the fallback to pick and the
  // cleared state is observable on its own.
  it('clears the selection when the id it holds is the rejected one', () => {
    const { result } = renderHook(() => useSelectedPortfolio([{ portfolio_id: 'A' }]), {
      wrapper: wrapperFor('/portfolio?portfolioId=A'),
    });

    act(() => result.current.selectPortfolio('A'));
    act(() => result.current.clearSelection('A'));

    expect(result.current.portfolioId).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('falls back to the next un-rejected portfolio after a clear', () => {
    const { result } = renderHook(() => useSelectedPortfolio(portfolios), {
      wrapper: wrapperFor('/portfolio?portfolioId=A'),
    });

    act(() => result.current.selectPortfolio('A'));
    act(() => result.current.clearSelection('A'));

    expect(result.current.portfolioId).toBe('B');
  });

  // PortfolioScope's 404-recovery effect closes over the portfolio that was
  // selected when it was committed. React 18 flushes pending passive effects
  // before rendering the next update, so that effect can run *after* the user
  // has already moved to another portfolio, and everything it closed over
  // still names the old one. Clearing there would drop a selection the user
  // just made and wipe the stored id. Calling both in one act() reproduces
  // that ordering without having to race the scheduler.
  it('ignores a stale rejection for a portfolio the user has already left', () => {
    const { result } = renderHook(() => useSelectedPortfolio(portfolios), {
      wrapper: wrapperFor('/portfolio?portfolioId=A'),
    });

    act(() => {
      result.current.selectPortfolio('B');
      result.current.clearSelection('A'); // the late effect, pinned to A
    });

    expect(result.current.portfolioId).toBe('B');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('B');
  });

  // The rejected id still has to be remembered on the stale path, or the
  // fallback below would re-select it the next time the selection empties.
  it('still refuses to fall back to an id rejected by a stale call', () => {
    const { result } = renderHook(() => useSelectedPortfolio(portfolios), {
      wrapper: wrapperFor('/portfolio?portfolioId=A'),
    });

    act(() => {
      result.current.selectPortfolio('B');
      result.current.clearSelection('A');
    });
    act(() => result.current.clearSelection('B'));

    // Both are rejected now, so the fallback has nothing to offer. The point
    // is that it does not go back to A, which the stale call did reject.
    expect(result.current.portfolioId).toBeNull();
  });
});

// docs/api/watchlist-v1.md, served by market-trading.

import {
  authedDelete,
  authedGet,
  authedPost,
  MARKET_TRADING_API_URL,
} from '../../lib/authed-api';

export interface WatchlistItem {
  symbol: string;
  company_name: string;
  added_at: string;
  // The company's own latest session; all four are null when it has no prices.
  trade_date: string | null;
  close: number | null;
  change: number | null;
  change_pct: number | null;
}

export interface Watchlist {
  limit: number;
  items: WatchlistItem[];
}

// §3.1
export async function getWatchlist(): Promise<Watchlist> {
  return (await authedGet<Watchlist>('/watchlist', undefined, MARKET_TRADING_API_URL)).data;
}

// §3.2 — idempotent; answers the whole list.
export async function addToWatchlist(symbol: string): Promise<Watchlist> {
  return (await authedPost<Watchlist>('/watchlist', { symbol }, { baseUrl: MARKET_TRADING_API_URL })).data;
}

// §3.3 — idempotent.
export function removeFromWatchlist(symbol: string): Promise<void> {
  return authedDelete(`/watchlist/${encodeURIComponent(symbol)}`, MARKET_TRADING_API_URL);
}

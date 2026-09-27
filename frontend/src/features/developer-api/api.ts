// docs/api/public-api-v1.md §7, served by market-trading. JWT-authenticated
// (same session token as the rest of the SPA), unlike /api/public/v1 itself.

import {
  authedDelete,
  authedGet,
  authedPost,
  MARKET_TRADING_API_URL,
} from '../../lib/authed-api';

export interface DeveloperKey {
  prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

/** Only returned once, from create/regenerate — never stored or refetched. */
export interface CreatedDeveloperKey extends DeveloperKey {
  key: string;
}

export interface DeveloperUsageDay {
  date: string;
  request_count: number;
}

export interface DeveloperUsage {
  limit: number;
  // null when the hourly count can't be read right now.
  used: number | null;
  reset_at: string;
  // Always 30 entries, oldest first, one per UTC day including today.
  daily: DeveloperUsageDay[];
}

// §7.1 — null when the user has no active key.
export async function getDeveloperKey(): Promise<DeveloperKey | null> {
  return (await authedGet<DeveloperKey | null>('/developer/key', undefined, MARKET_TRADING_API_URL))
    .data;
}

// §7.2 — 409 API_KEY_EXISTS when one is already active; callers fall back to
// refetching and showing it rather than treating that as a hard error.
export async function createDeveloperKey(label?: string): Promise<CreatedDeveloperKey> {
  return (
    await authedPost<CreatedDeveloperKey>(
      '/developer/key',
      { label },
      { baseUrl: MARKET_TRADING_API_URL },
    )
  ).data;
}

// §7.3 — revokes the active key and issues a new one in one step.
export async function regenerateDeveloperKey(label?: string): Promise<CreatedDeveloperKey> {
  return (
    await authedPost<CreatedDeveloperKey>(
      '/developer/key/regenerate',
      { label },
      { baseUrl: MARKET_TRADING_API_URL },
    )
  ).data;
}

// §7.4 — 204, idempotent.
export function revokeDeveloperKey(): Promise<void> {
  return authedDelete('/developer/key', MARKET_TRADING_API_URL);
}

// §7.5 — null when the user has no active key.
export async function getDeveloperUsage(): Promise<DeveloperUsage | null> {
  return (
    await authedGet<DeveloperUsage | null>('/developer/usage', undefined, MARKET_TRADING_API_URL)
  ).data;
}

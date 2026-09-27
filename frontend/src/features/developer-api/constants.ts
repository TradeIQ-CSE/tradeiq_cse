// Public API facts (docs/api/public-api-v1.md §1–§3, §9) shared between the
// Settings card and the public Developers page, so the two can't drift.

export const PUBLIC_API_BASE_URL = 'https://tradeiqcse.tech/api/public/v1';
export const PUBLIC_API_DOCS_URL = `${PUBLIC_API_BASE_URL}/docs`;
export const PUBLIC_API_KEY_HEADER = 'X-API-Key';
export const PUBLIC_API_HOURLY_LIMIT = 100;
// A real, listed symbol (docs/api/public-api-v1.md §6.2 example) — quick-start
// snippets call a real path, never an invented one.
export const PUBLIC_API_EXAMPLE_SYMBOL = 'JKH.N0000';
export const PUBLIC_API_EXAMPLE_PATH = `/securities/${PUBLIC_API_EXAMPLE_SYMBOL}/ohlcv?timeframe=daily`;

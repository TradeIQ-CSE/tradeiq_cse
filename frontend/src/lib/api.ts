// Shared client for the market-trading API. Response/error shapes follow
// docs/api/endpoint-catalogue-v0.md and docs/api/error-envelope.md.

const MARKET_TRADING_API_URL = import.meta.env.VITE_MARKET_TRADING_API_URL;

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: { field: string; reason: string }[];
  trace_id: string;
}

export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody) {
    super(body.message);
  }
}

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  // Trading date the rows are priced at, and the selectable bounds.
  as_of?: string | null;
  available_from?: string | null;
  available_to?: string | null;
}

export async function getEnvelope<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<{ data: T; meta?: PageMeta }> {
  const url = new URL(path, MARKET_TRADING_API_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) {
    throw new ApiError(body.error);
  }
  return body;
}

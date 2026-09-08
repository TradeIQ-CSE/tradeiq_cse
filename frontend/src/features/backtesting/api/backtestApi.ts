import {
  CreateBacktestRunRequest,
  CreateBacktestRunResponse,
  BacktestStatusResponse,
} from '../domain/types';
import { ApiError, ApiErrorBody } from '../../../lib/api';
import { authFetch } from '../../../lib/authed-api';
import { SecurityListItem } from '../../markets/types';

const MARKET_TRADING_API_URL =
  import.meta.env.VITE_MARKET_TRADING_API_URL || 'http://localhost:3001';

async function handleResponse<T>(response: Response): Promise<T> {
  let body: { error?: ApiErrorBody; message?: string } | null = null;
  try {
    body = (await response.json()) as { error?: ApiErrorBody; message?: string };
  } catch {
    if (!response.ok) {
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: `HTTP request failed with status ${response.status} ${response.statusText}`,
        trace_id: 'unknown',
      });
    }
    return {} as T;
  }

  if (!response.ok) {
    if (body && body.error) {
      throw new ApiError(body.error);
    }
    throw new ApiError({
      code: 'API_ERROR',
      message: body?.message || `Request failed with HTTP ${response.status}`,
      trace_id: 'unknown',
    });
  }

  return body as unknown as T;
}

/**
 * Submits a new backtest run configuration to POST /api/v1/backtests
 */
export async function submitBacktestRun(
  request: CreateBacktestRunRequest,
): Promise<CreateBacktestRunResponse> {
  // A run belongs to the authenticated user, so this goes through authFetch:
  // market-trading takes the owner from the verified token, and an
  // unauthenticated submission is a 401 rather than a run owned by nobody.
  const response = await authFetch(
    '/api/v1/backtests',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    },
    MARKET_TRADING_API_URL,
  );

  const res = await handleResponse<{ id?: string; runId?: string; status?: 'queued' | 'running' | 'completed' | 'failed' }>(response);
  const id = res.runId || res.id;
  if (!id) {
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: 'Server returned a successful response but is missing a valid run identifier.',
      trace_id: 'unknown',
    });
  }

  return {
    id,
    status: res.status || 'queued',
  };
}

/**
 * Retrieves the live status of a submitted run from GET /api/v1/backtests/:runId
 */
export async function getBacktestRunStatus(
  runId: string,
): Promise<BacktestStatusResponse> {
  const response = await authFetch(
    `/api/v1/backtests/${runId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
    MARKET_TRADING_API_URL,
  );

  return handleResponse<BacktestStatusResponse>(response);
}

/**
 * Retrieves the CSE securities list to populate the universe selector
 */
export async function getSecuritiesUniverse(
  search?: string,
): Promise<SecurityListItem[]> {
  const url = new URL('/securities', MARKET_TRADING_API_URL);
  url.searchParams.set('page_size', '100');
  if (search && search.trim()) {
    url.searchParams.set('search', search.trim());
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const res = await handleResponse<{ data: SecurityListItem[] }>(response);
  return res.data || [];
}

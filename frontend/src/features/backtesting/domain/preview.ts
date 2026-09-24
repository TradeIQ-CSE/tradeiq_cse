import { BacktestConfig, BacktestResultsResponse } from './types';

const PREVIEW_KEY = 'tradeiq_backtest_preview_v1';

/**
 * A backtest a visitor ran without an account. The API stores nothing for
 * it, so this tab's sessionStorage is the only copy: it survives the trip
 * through sign-up/sign-in and back, where it can be saved as a real run.
 */
export interface BacktestPreviewRecord {
  config: BacktestConfig;
  results: BacktestResultsResponse;
  ranAt: string;
}

export function storeBacktestPreview(record: BacktestPreviewRecord): void {
  try {
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(record));
  } catch {
    // Quota/access errors: the page still receives it through navigation state.
  }
}

export function loadBacktestPreview(): BacktestPreviewRecord | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BacktestPreviewRecord>;
    return parsed.config && parsed.results && parsed.ranAt
      ? (parsed as BacktestPreviewRecord)
      : null;
  } catch {
    return null;
  }
}

export function clearBacktestPreview(): void {
  try {
    sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    // Ignore
  }
}

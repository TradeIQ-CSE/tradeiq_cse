export interface EodSecurityInput {
  symbol: string;
  company_name: string;
  cse_code?: string;
  shares_outstanding?: string;
}

export interface EodPriceInput {
  symbol: string;
  open: string | null;
  high: string;
  low: string;
  close: string;
  volume: string;
  validation_warnings: string[];
  ohlc_repaired: boolean;
}

export interface EodIngestionRequest {
  contract_version: '1';
  batch_id: string;
  trade_date: string;
  source: {
    name: string;
    captured_at: string;
    source_date_method: string;
    raw_payload_hash: string;
    producer_commit?: string;
    action_run_url?: string;
  };
  calendar: {
    is_trading_day: true;
    source: string;
    verified_at: string;
  };
  validation: {
    processed: number;
    accepted: number;
    rejected: number;
    repaired: number;
  };
  securities: EodSecurityInput[];
  prices: EodPriceInput[];
  market_digest: string;
}

export interface EodIngestionReceipt {
  batch_id: string;
  trade_date: string;
  status: string;
  market_digest: string;
  records_processed: number;
  records_accepted: number;
  records_quarantined: number;
  started_at: string;
  completed_at: string;
  replayed: boolean;
}

// Mirrors docs/api/endpoint-catalogue-v0.md §3 (GET /securities).

export interface Sector {
  gics_code: string;
  name: string;
}

export interface SecurityListItem {
  symbol: string;
  company_name: string;
  sector: Sector | null;
  shares_outstanding: number | null;
  data_from: string | null;
  data_to: string | null;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  pe_ratio: number | null;
}

export type SecuritiesSort = 'symbol' | 'company_name';

export type ListingStatus = 'listed' | 'suspended' | 'delisted';

export interface SecurityDetail {
  symbol: string;
  company_name: string;
  cse_code: string | null;
  sector: Sector | null;
  shares_outstanding: number | null;
  data_from: string | null;
  data_to: string | null;
  listing_status: ListingStatus;
  latest: {
    trade_date: string;
    close: number;
    change: number | null;
    change_pct: number | null;
    volume: number;
  } | null;
  ratios: {
    valid_from: string;
    pe_ratio: number | null;
    pb_ratio: number | null;
  } | null;
}

export type OhlcvTimeframe = 'daily' | 'weekly' | 'monthly';

export interface DailyOhlcvBar {
  date: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  adjusted_close: number | null;
  volume: number;
}

export interface AggregateOhlcvBar {
  period_start: string;
  period_end: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResponse {
  symbol: string;
  timeframe: OhlcvTimeframe;
  from: string | null;
  to: string | null;
  bars: (DailyOhlcvBar | AggregateOhlcvBar)[];
}

export interface OhlcvRange {
  from?: string;
  to?: string;
}

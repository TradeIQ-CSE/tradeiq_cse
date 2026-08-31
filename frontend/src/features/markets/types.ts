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

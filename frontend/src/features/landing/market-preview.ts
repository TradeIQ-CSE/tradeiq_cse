import type { SecurityListItem } from '../markets/types';

/**
 * Fixed landing-page preview. Keeping this local means the public page paints
 * its complete first view immediately; the Markets route remains API-backed.
 *
 * These values come from the seeded development fixture and are deliberately
 * labelled "Sample data" in the UI. They carry no session date because the
 * fixture is not documented as a validated CSE close.
 */
export const LANDING_MARKET_PREVIEW: SecurityListItem[] = [
  {
    symbol: 'COMB.N0000',
    company_name: 'Commercial Bank of Ceylon PLC',
    sector: { gics_code: '4010', name: 'Banks' },
    shares_outstanding: null,
    data_from: null,
    data_to: null,
    price: 142.72,
    change: null,
    change_pct: 1.23,
    volume: null,
    pe_ratio: null,
  },
  {
    symbol: 'CTC.N0000',
    company_name: 'Ceylon Tobacco Company PLC',
    sector: { gics_code: '3020', name: 'Food, Beverage & Tobacco' },
    shares_outstanding: null,
    data_from: null,
    data_to: null,
    price: 992.64,
    change: null,
    change_pct: 0.94,
    volume: null,
    pe_ratio: null,
  },
  {
    symbol: 'DIAL.N0000',
    company_name: 'Dialog Axiata PLC',
    sector: { gics_code: '5010', name: 'Telecommunication Services' },
    shares_outstanding: null,
    data_from: null,
    data_to: null,
    price: 13.49,
    change: null,
    change_pct: 0.67,
    volume: null,
    pe_ratio: null,
  },
  {
    symbol: 'HNB.N0000',
    company_name: 'Hatton National Bank PLC',
    sector: { gics_code: '4010', name: 'Banks' },
    shares_outstanding: null,
    data_from: null,
    data_to: null,
    price: 259.75,
    change: null,
    change_pct: 1.87,
    volume: null,
    pe_ratio: null,
  },
  {
    symbol: 'JKH.N0000',
    company_name: 'John Keells Holdings PLC',
    sector: { gics_code: '2530', name: 'Consumer Discretionary' },
    shares_outstanding: null,
    data_from: null,
    data_to: null,
    price: 22.73,
    change: null,
    change_pct: 1.7,
    volume: null,
    pe_ratio: null,
  },
];

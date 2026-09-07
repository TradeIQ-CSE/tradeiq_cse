import { SecurityListItem } from '../markets/types';

/**
 * The rows the landing preview falls back to when GET /securities cannot be
 * reached.
 *
 * A landing page is the first thing a visitor sees, and rendering an error
 * strip there is worse than showing nothing — so the section always has a
 * table. What it must never do is let a viewer mistake these for the current
 * market.
 *
 * So this snapshot is deliberately NOT dated. It was taken from the seeded
 * development dataset, whose small bundled fixture
 * (`pipeline/data-ingestion/src/data_ingestion/fixtures/sample`) is not
 * documented anywhere as genuine CSE closes — the validated `cse-dataset`
 * bundle only loads when CSE_DATA_SOURCE_URL is configured. Stamping a
 * trading date on numbers whose provenance we cannot vouch for would present
 * a session that may never have happened, against real listed tickers.
 *
 * `LandingMarketData` therefore labels this path "Sample data" rather than
 * "as of <date>", and only shows a real session date when the figures came
 * from the API. If the validated bundle is ever wired up, this can become a
 * genuinely dated snapshot and the badge can go.
 *
 * Fields the preview does not read are null rather than invented.
 */
export const PREVIEW_FALLBACK: SecurityListItem[] = [
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

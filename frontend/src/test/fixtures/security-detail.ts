import {
  OhlcvResponse,
  SecurityDetail,
} from '../../features/markets/types';

export const securityDetailFixture: SecurityDetail = {
  symbol: 'JKH.N0000',
  company_name: 'John Keells Holdings PLC',
  cse_code: 'JKH.N0000',
  sector: { gics_code: '2530', name: 'Consumer Discretionary' },
  shares_outstanding: 871_355_047,
  data_from: '2020-01-02',
  data_to: '2026-09-02',
  listing_status: 'listed',
  latest: {
    trade_date: '2026-09-02',
    close: 198.5,
    change: 2.25,
    change_pct: 1.15,
    volume: 452_311,
  },
  ratios: {
    valid_from: '2026-07-01',
    pe_ratio: 14.2,
    pb_ratio: 1.8,
  },
};

export const dailyOhlcvFixture: OhlcvResponse = {
  symbol: 'JKH.N0000',
  timeframe: 'daily',
  from: '2025-09-02',
  to: '2026-09-02',
  bars: [
    {
      date: '2026-09-01',
      open: null,
      high: 199,
      low: 194,
      close: 196.25,
      adjusted_close: null,
      volume: 300_500,
    },
    {
      date: '2026-09-02',
      open: 196.25,
      high: 200,
      low: 195.5,
      close: 198.5,
      adjusted_close: 198.25,
      volume: 452_311,
    },
  ],
};

export const weeklyOhlcvFixture: OhlcvResponse = {
  symbol: 'JKH.N0000',
  timeframe: 'weekly',
  from: '2026-08-01',
  to: '2026-09-02',
  bars: [
    {
      period_start: '2026-08-24',
      period_end: '2026-08-28',
      open: 190,
      high: 198,
      low: 189,
      close: 196,
      volume: 2_500_000,
    },
  ],
};

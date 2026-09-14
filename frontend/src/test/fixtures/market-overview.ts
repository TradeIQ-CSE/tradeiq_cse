import { MarketOverview } from '../../features/markets/types';

// endpoint-catalogue-v0.md §6. The percentage spreads are deliberately uneven
// so a test can tell a bar scaled against the list's own peak apart from one
// scaled against a fixed range.
export const marketOverviewFixture: MarketOverview = {
  as_of: '2026-09-02',
  gainers: [
    {
      rank: 1,
      symbol: 'HNB.N0000',
      company_name: 'Hatton National Bank PLC',
      close: 259.75,
      change: 4.78,
      change_pct: 4.0,
      volume: 1_058_463,
    },
    {
      rank: 2,
      symbol: 'JKH.N0000',
      company_name: 'John Keells Holdings PLC',
      close: 22.73,
      change: 0.38,
      change_pct: 1.0,
      volume: 1_571_980,
    },
  ],
  losers: [
    {
      rank: 1,
      symbol: 'SAMP.N0000',
      company_name: 'Sampath Bank PLC',
      close: 80.19,
      change: -0.93,
      change_pct: -1.15,
      volume: 858_773,
    },
  ],
  most_active: [
    {
      rank: 1,
      symbol: 'DIAL.N0000',
      company_name: 'Dialog Axiata PLC',
      close: 11.4,
      change: 0.1,
      change_pct: 0.88,
      volume: 4_000_000,
    },
    {
      rank: 2,
      symbol: 'LOLC.N0000',
      company_name: 'LOLC Holdings PLC',
      close: 402.5,
      change: -1.5,
      change_pct: -0.37,
      volume: 1_000_000,
    },
  ],
};

import { DailyBar, FeeConfig, PositionSizingConfig } from '../domain/types';

export const DEFAULT_TEST_FEES: FeeConfig = {
  brokerageRate: 0.0064,
  cseRate: 0.00084,
  cdsRate: 0.00024,
  secCessRate: 0.00072,
  stlRate: 0.003,
};

export const DEFAULT_SIZING: PositionSizingConfig = {
  type: 'full_capital',
};

export function createSampleBars(): DailyBar[] {
  return [
    {
      date: '2026-08-01',
      open: 100,
      high: 105,
      low: 98,
      close: 102,
      volume: 1000,
    },
    {
      date: '2026-08-02',
      open: 102,
      high: 103,
      low: 95,
      close: 96,
      volume: 1100,
    },
    {
      date: '2026-08-03',
      open: 96,
      high: 108,
      low: 95,
      close: 107,
      volume: 1200,
    },
    {
      date: '2026-08-04',
      open: 107,
      high: 115,
      low: 106,
      close: 112,
      volume: 1300,
    },
    {
      date: '2026-08-05',
      open: 112,
      high: 120,
      low: 111,
      close: 118,
      volume: 1400,
    },
  ];
}

import { Index, IndexValuesResponse } from '../../features/markets/types';

export const indicesFixture: Index[] = [
  {
    code: 'ASPI',
    name: 'All Share Price Index',
    latest: {
      date: '2026-09-02',
      close: 15736.91,
      previous_date: '2026-09-01',
      change: -87.4,
      change_pct: -0.55,
    },
  },
  {
    code: 'ASTRI',
    name: 'All Share Total Return Index',
    latest: {
      date: '2026-09-02',
      close: 34385.16,
      previous_date: '2026-09-01',
      change: 271.17,
      change_pct: 0.79,
    },
  },
  {
    code: 'SL20',
    name: 'S&P Sri Lanka 20',
    latest: {
      date: '2026-09-02',
      close: 4734.44,
      previous_date: '2026-09-01',
      change: -27.87,
      change_pct: -0.59,
    },
  },
  {
    code: 'SL20TRI',
    name: 'S&P Sri Lanka 20 Total Return Index',
    latest: {
      date: '2026-09-02',
      close: 12577.43,
      previous_date: '2026-09-01',
      change: 94.02,
      change_pct: 0.75,
    },
  },
];

export const aspiValuesFixture: IndexValuesResponse = {
  code: 'ASPI',
  name: 'All Share Price Index',
  from: '2026-08-01',
  to: '2026-09-02',
  values: [
    { date: '2026-09-01', close: 15824.31 },
    { date: '2026-09-02', close: 15736.91 },
  ],
};

export const sl20ValuesFixture: IndexValuesResponse = {
  code: 'SL20',
  name: 'S&P Sri Lanka 20',
  from: '2026-08-01',
  to: '2026-09-02',
  values: [
    { date: '2026-09-01', close: 4762.31 },
    { date: '2026-09-02', close: 4734.44 },
  ],
};

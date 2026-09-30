// Illustrative public-symbol fixtures, not live market observations. Each
// response is paired with an executable request and validated against the
// emitted schema and an isolated real application in the documentation e2e.
export interface WorkedExample {
  summary: string;
  value: unknown;
  'x-request': string;
}
const comb = {
  symbol: 'COMB.N0000',
  company_name: 'Commercial Bank of Ceylon PLC',
  cse_code: 'COMB.N0000',
  sector: { gics_code: '4010', name: 'Banks' },
  listing_status: 'listed',
  shares_outstanding: 1467151555,
  data_from: '2025-12-31',
  data_to: '2025-12-31',
};
const jkh = {
  symbol: 'JKH.N0000',
  company_name: 'John Keells Holdings PLC',
  cse_code: 'JKH.N0000',
  sector: null,
  listing_status: 'listed',
  shares_outstanding: null,
  data_from: '2025-01-02',
  data_to: '2025-01-03',
};
const bars = [
  {
    date: '2025-01-02',
    open: null,
    high: 22.59,
    low: 22.13,
    close: 22.43,
    volume: 1631334,
  },
  {
    date: '2025-01-03',
    open: 22.43,
    high: 22.84,
    low: 21.75,
    close: 22.73,
    volume: 2000000,
  },
];
const meta = (pageSize: number, total: number, page = 1) => ({
  page,
  page_size: pageSize,
  total,
});
function ohlcv(
  timeframe: 'daily' | 'weekly' | 'monthly',
  aggregate = false,
): WorkedExample {
  return {
    summary: aggregate
      ? `Partial ${timeframe} period: earliest non-null open`
      : 'Daily bars with an unavailable opening price',
    'x-request': `/securities/JKH.N0000/ohlcv?timeframe=${timeframe}&from=2025-01-02&to=2025-01-03&page=1&page_size=500`,
    value: {
      data: {
        symbol: 'JKH.N0000',
        timeframe,
        from: '2025-01-02',
        to: '2025-01-03',
        bars: aggregate
          ? [
              {
                period_start: '2025-01-02',
                period_end: '2025-01-03',
                open: 22.43,
                high: 22.84,
                low: 21.75,
                close: 22.73,
                volume: 3631334,
              },
            ]
          : bars,
      },
      meta: meta(500, aggregate ? 1 : 2),
    },
  };
}
export const WORKED_EXAMPLES: Record<string, Record<string, WorkedExample>> = {
  '/public/v1/securities': {
    primary: {
      summary: 'Search a symbol prefix',
      'x-request': '/securities?search=COMB&page=1&page_size=50',
      value: { data: [comb], meta: meta(50, 1) },
    },
    emptyPage: {
      summary: 'A page beyond the result set',
      'x-request': '/securities?search=COMB&page=2&page_size=50',
      value: { data: [], meta: meta(50, 1, 2) },
    },
  },
  '/public/v1/securities/{symbol}': {
    primary: {
      summary: 'A classified security',
      'x-request': '/securities/COMB.N0000',
      value: { data: comb },
    },
    nullable: {
      summary: 'Unavailable classification and share count',
      'x-request': '/securities/JKH.N0000',
      value: { data: jkh },
    },
  },
  '/public/v1/securities/{symbol}/ohlcv': {
    primary: ohlcv('daily'),
    weekly: ohlcv('weekly', true),
    monthly: ohlcv('monthly', true),
    empty: {
      summary: 'A valid range without observations',
      'x-request':
        '/securities/JKH.N0000/ohlcv?timeframe=daily&from=2025-01-04&to=2025-01-05&page=1&page_size=500',
      value: {
        data: {
          symbol: 'JKH.N0000',
          timeframe: 'daily',
          from: '2025-01-04',
          to: '2025-01-05',
          bars: [],
        },
        meta: meta(500, 0),
      },
    },
  },
  '/public/v1/indices': {
    primary: {
      summary: 'Each index has its own latest observation or null',
      'x-request': '/indices?page=1&page_size=50',
      value: {
        data: [
          { code: 'ASPI', name: 'All Share Price Index', latest: null },
          {
            code: 'SL20',
            name: 'S&P Sri Lanka 20',
            latest: {
              date: '2025-01-03',
              close: 4740.06,
              change: 8,
              change_pct: 0.17,
            },
          },
        ],
        meta: meta(50, 2),
      },
    },
  },
  '/public/v1/indices/{code}/values': {
    primary: {
      summary: 'Two daily close observations',
      'x-request':
        '/indices/SL20/values?from=2025-01-02&to=2025-01-03&page=1&page_size=500',
      value: {
        data: {
          code: 'SL20',
          name: 'S&P Sri Lanka 20',
          from: '2025-01-02',
          to: '2025-01-03',
          values: [
            { date: '2025-01-02', close: 4732.06 },
            { date: '2025-01-03', close: 4740.06 },
          ],
        },
        meta: meta(500, 2),
      },
    },
    empty: {
      summary: 'No values in the requested range',
      'x-request':
        '/indices/SL20/values?from=2025-01-04&to=2025-01-05&page=1&page_size=500',
      value: {
        data: {
          code: 'SL20',
          name: 'S&P Sri Lanka 20',
          from: '2025-01-04',
          to: '2025-01-05',
          values: [],
        },
        meta: meta(500, 0),
      },
    },
  },
  '/public/v1/eod': {
    primary: {
      summary: 'One session, with no previous observation to compare',
      'x-request': '/eod?date=2025-12-31&page=1&page_size=200',
      value: {
        data: [
          {
            symbol: 'COMB.N0000',
            date: '2025-12-31',
            open: 90.1,
            high: 90.55,
            low: 88.9,
            close: 89.7,
            volume: 512800,
            change: null,
            change_pct: null,
          },
        ],
        meta: { ...meta(200, 1), as_of: '2025-12-31' },
      },
    },
    empty: {
      summary: 'An explicit date without a session',
      'x-request': '/eod?date=2025-01-04&page=1&page_size=200',
      value: { data: [], meta: { ...meta(200, 0), as_of: null } },
    },
  },
};
export const QUOTA_EXAMPLES = {
  perKey: {
    summary: 'Per-key hourly quota',
    value: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded.',
        reset_at: '2026-09-30T11:00:00Z',
        trace_id: 'example-trace-id',
      },
    },
  },
  edge: {
    summary: 'Per-IP edge throttle (Retry-After header, no reset_at)',
    value: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a minute and try again.',
        trace_id: 'example-trace-id',
      },
    },
  },
};

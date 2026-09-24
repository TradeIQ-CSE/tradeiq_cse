import { http, HttpResponse } from 'msw';
import {
  cashTransactionsFixture,
  portfolioFixture,
  positionsFixture,
  summaryFixture,
} from './fixtures/paper-trading';
import { marketOverviewFixture } from './fixtures/market-overview';
import { dataCoverageFixture } from './fixtures/data-coverage';
import { securitiesFixture } from './fixtures/securities';
import {
  dailyOhlcvFixture,
  securityDetailFixture,
} from './fixtures/security-detail';
import {
  aspiValuesFixture,
  indicesFixture,
  sl20ValuesFixture,
} from './fixtures/indices';

// Default handlers used by every test unless overridden with `server.use(...)`.
// Shapes mirror lib/api.ts exactly: a success body is the whole envelope
// (`{ data, meta }`), a failure body is `{ error: { code, message, trace_id } }`
// because `getEnvelope` throws `new ApiError(body.error)`.
export const handlers = [
  http.get('*/market/overview', () => {
    return HttpResponse.json({ data: marketOverviewFixture });
  }),

  http.get('*/coverage', () => {
    return HttpResponse.json({ data: dataCoverageFixture });
  }),

  // Order matters: the specific /:code/values route must be declared before
  // the bare /indices list, same reasoning as the portfolios routes below.
  http.get('*/indices/:code/values', ({ params }) => {
    const fixture =
      params.code === 'SL20' ? sl20ValuesFixture : aspiValuesFixture;
    return HttpResponse.json({ data: fixture });
  }),

  http.get('*/indices', () => {
    return HttpResponse.json({ data: indicesFixture });
  }),

  http.get('*/securities/:symbol/ohlcv', () => {
    return HttpResponse.json({ data: dailyOhlcvFixture });
  }),

  http.get('*/securities/:symbol', () => {
    return HttpResponse.json({ data: securityDetailFixture });
  }),

  http.get('*/securities', () => {
    return HttpResponse.json({
      data: securitiesFixture,
      meta: {
        page: 1,
        page_size: 25,
        total: securitiesFixture.length,
        as_of: '2026-09-02',
        available_from: '2020-01-02',
        available_to: '2026-09-02',
      },
    });
  }),

  // Paper trading (identity-auth, docs/api/paper-trading-v1.md). The order of
  // these matters: msw matches in order, so `/portfolios/:id/...` must be
  // declared before the bare `/portfolios` list would swallow it.
  http.get('*/portfolios/:portfolioId/positions', () => {
    return HttpResponse.json({
      data: positionsFixture,
      meta: { as_of: summaryFixture.as_of, total: positionsFixture.length },
    });
  }),

  http.get('*/portfolios/:portfolioId/summary', () => {
    return HttpResponse.json({ data: summaryFixture });
  }),

  http.get('*/portfolios/:portfolioId/cash-transactions', () => {
    return HttpResponse.json({
      data: cashTransactionsFixture,
      meta: { page: 1, page_size: 50, total: cashTransactionsFixture.length },
    });
  }),

  http.get('*/portfolios', () => {
    return HttpResponse.json({
      data: [portfolioFixture],
      meta: { page: 1, page_size: 50, total: 1 },
    });
  }),
];

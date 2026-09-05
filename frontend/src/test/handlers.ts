import { http, HttpResponse } from 'msw';
import { securitiesFixture } from './fixtures/securities';

// Default handlers used by every test unless overridden with `server.use(...)`.
// Shapes mirror lib/api.ts exactly: a success body is the whole envelope
// (`{ data, meta }`), a failure body is `{ error: { code, message, trace_id } }`
// because `getEnvelope` throws `new ApiError(body.error)`.
export const handlers = [
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
];

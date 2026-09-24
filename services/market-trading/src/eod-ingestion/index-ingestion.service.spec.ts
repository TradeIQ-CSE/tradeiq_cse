import { DataSource } from 'typeorm';
import { DataCoverageService } from '../data-coverage/data-coverage.service';
import { IndexIngestionService } from './index-ingestion.service';
import { IndexIngestionDto } from './index-ingestion.dto';

const request = (): IndexIngestionDto =>
  ({
    trade_date: '2026-09-04',
    calendar: { is_trading_day: true, source: 'CSE' },
    values: [
      { code: 'ASPI', close: '10500.1234' },
      { code: 'SNSX', close: '3400.5678' },
    ],
  }) as IndexIngestionDto;

// The service issues several statements per call; the mock dispatches on the
// SQL text rather than call order, same approach as orders.service.spec.ts,
// so it survives unrelated statements being added later.
function respond(
  mock: jest.Mock,
  handlers: { match: string; rows: unknown[] }[],
) {
  mock.mockImplementation((sql: string) => {
    const handler = handlers.find((h) => sql.includes(h.match));
    return Promise.resolve(handler ? handler.rows : []);
  });
}

function service(txQuery: jest.Mock, invalidate: jest.Mock) {
  const dataSource = {
    transaction: jest.fn((cb: (manager: unknown) => unknown) =>
      cb({ query: txQuery }),
    ),
  } as unknown as DataSource;
  const dataCoverage = { invalidate } as unknown as DataCoverageService;
  return new IndexIngestionService(dataSource, dataCoverage);
}

describe('IndexIngestionService', () => {
  it('invalidates coverage when a value is newly stored', async () => {
    const txQuery = jest.fn();
    const invalidate = jest.fn();
    respond(txQuery, [
      { match: 'pg_advisory_xact_lock', rows: [] },
      {
        match: 'SELECT index_code FROM market_data.indices',
        rows: [{ index_code: 'ASPI' }, { index_code: 'SNSX' }],
      },
      { match: 'FROM market_data.trading_calendar', rows: [] },
      { match: 'INSERT INTO market_data.trading_calendar', rows: [] },
      // Neither code has an existing close for this date, so both are new.
      { match: 'FROM market_data.index_values', rows: [] },
      { match: 'INSERT INTO market_data.index_values', rows: [] },
    ]);

    const result = await service(txQuery, invalidate).ingest(request());

    expect(result.data.stored).toEqual(['ASPI', 'SNSX']);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate coverage when nothing new is stored', async () => {
    const txQuery = jest.fn();
    const invalidate = jest.fn();
    respond(txQuery, [
      { match: 'pg_advisory_xact_lock', rows: [] },
      {
        match: 'SELECT index_code FROM market_data.indices',
        rows: [{ index_code: 'ASPI' }, { index_code: 'SNSX' }],
      },
      {
        match: 'FROM market_data.trading_calendar',
        rows: [{ is_trading_day: true }],
      },
      // Both codes already carry the same close for this date, so the write
      // confirms unchanged values rather than storing anything new.
      {
        match: 'FROM market_data.index_values',
        rows: [
          { index_code: 'ASPI', close: '10500.1234' },
          { index_code: 'SNSX', close: '3400.5678' },
        ],
      },
    ]);

    const result = await service(txQuery, invalidate).ingest(request());

    expect(result.data.stored).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

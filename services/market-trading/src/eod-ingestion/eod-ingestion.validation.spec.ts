import {
  calculateMarketDigest,
  parseEodIngestionRequest,
} from './eod-ingestion.validation';
import { EodIngestionRequest } from './eod-ingestion.types';

function validRequest(): EodIngestionRequest {
  const prices = [
    {
      symbol: 'TEST.N0000',
      open: '10.0000',
      high: '12.0000',
      low: '9.5000',
      close: '11.2500',
      volume: '1234',
      validation_warnings: [],
      ohlc_repaired: false,
    },
  ];
  return {
    contract_version: '1',
    batch_id: 'a'.repeat(64),
    trade_date: '2026-09-04',
    source: {
      name: 'cse_trade_summary_current',
      captured_at: '2026-09-04T09:18:00Z',
      source_date_method: 'colombo_capture_date',
      raw_payload_hash: 'b'.repeat(64),
    },
    calendar: {
      is_trading_day: true,
      source: 'test calendar',
      verified_at: '2026-09-01T00:00:00Z',
    },
    validation: { processed: 1, accepted: 1, rejected: 0, repaired: 0 },
    securities: [{ symbol: 'TEST.N0000', company_name: 'Test PLC' }],
    prices,
    market_digest: calculateMarketDigest(prices),
  };
}

describe('parseEodIngestionRequest', () => {
  it('accepts a complete validated daily batch', () => {
    const result = parseEodIngestionRequest(validRequest());
    expect(result.fields).toEqual([]);
    expect(result.request).toEqual(validRequest());
  });

  it('rejects inconsistent OHLC bounds and a forged digest', () => {
    const body = validRequest();
    body.prices[0].high = '10.0000';

    const result = parseEodIngestionRequest(body);

    expect(result.request).toBeNull();
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'prices[0]' }),
        expect.objectContaining({ field: 'market_digest' }),
      ]),
    );
  });

  it('rejects partial batches and missing metadata', () => {
    const body = validRequest();
    body.validation.rejected = 1;
    body.securities = [];

    const result = parseEodIngestionRequest(body);

    expect(result.request).toBeNull();
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'validation' }),
        expect.objectContaining({ field: 'securities' }),
      ]),
    );
  });

  it('makes the digest independent of row order', () => {
    const first = validRequest().prices[0];
    const second = { ...first, symbol: 'ZZZZ.N0000' };
    expect(calculateMarketDigest([first, second])).toBe(
      calculateMarketDigest([second, first]),
    );
  });

  it('makes the digest independent of the trading date', () => {
    const firstDate = validRequest();
    const secondDate = { ...firstDate, trade_date: '2026-09-05' };

    const firstResult = parseEodIngestionRequest(firstDate);
    const secondResult = parseEodIngestionRequest(secondDate);

    expect(firstResult.fields).toEqual([]);
    expect(secondResult.fields).toEqual([]);
    expect(secondResult.request?.market_digest).toBe(
      firstResult.request?.market_digest,
    );
  });
});

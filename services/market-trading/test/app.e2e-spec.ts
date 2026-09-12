process.env.MARKET_DATA_DATABASE_URL =
  process.env.MARKET_DATA_DATABASE_URL ||
  'postgresql://market_data:changeme@localhost:5432/market_data';
process.env.MARKET_INGESTION_TOKEN = 'test-market-ingestion-token';

import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';
import { DataSource } from 'typeorm';
import { calculateMarketDigest } from '../src/eod-ingestion/eod-ingestion.validation';
import { PaperTradingQuotesService } from '../src/paper-trading-quotes/paper-trading-quotes.service';

describe('HealthModule (e2e)', () => {
  let app: NestExpressApplication;
  let quotes: PaperTradingQuotesService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // Same pipeline main.ts installs, so error-envelope assertions below test
    // what actually ships rather than Nest's default exception rendering.
    configureMarketTradingApp(app);
    await app.init();
    quotes = app.get(PaperTradingQuotesService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'market-trading' });
  });

  it('/market/overview (GET) ranks the seeded EOD session', async () => {
    const path = '/market/overview?as_of=2025-01-05&limit=2';
    const response = await request(app.getHttpServer()).get(path).expect(200);
    const repeated = await request(app.getHttpServer()).get(path).expect(200);

    expect(response.body.data.as_of).toBe('2025-01-03');
    expect(repeated.body).toEqual(response.body);
    expect(response.body.data.gainers).toEqual([
      {
        rank: 1,
        symbol: 'HNB.N0000',
        company_name: 'Hatton National Bank PLC',
        close: 257.12,
        change: 3.34,
        change_pct: 1.32,
        volume: 1517594,
      },
      {
        rank: 2,
        symbol: 'COMB.N0000',
        company_name: 'Commercial Bank of Ceylon PLC',
        close: 147.15,
        change: 1.34,
        change_pct: 0.92,
        volume: 1197713,
      },
    ]);
    expect(response.body.data.losers).toEqual([
      {
        rank: 1,
        symbol: 'SAMP.N0000',
        company_name: 'Sampath Bank PLC',
        close: 81.54,
        change: -1.51,
        change_pct: -1.82,
        volume: 528197,
      },
      {
        rank: 2,
        symbol: 'JKH.N0000',
        company_name: 'John Keells Holdings PLC',
        close: 22.32,
        change: -0.11,
        change_pct: -0.49,
        volume: 785056,
      },
    ]);
    expect(response.body.data.most_active).toEqual([
      {
        rank: 1,
        symbol: 'HNB.N0000',
        company_name: 'Hatton National Bank PLC',
        close: 257.12,
        change: 3.34,
        change_pct: 1.32,
        volume: 1517594,
      },
      {
        rank: 2,
        symbol: 'CTC.N0000',
        company_name: 'Ceylon Tobacco Company PLC',
        close: 965.36,
        change: 1.32,
        change_pct: 0.14,
        volume: 1382176,
      },
    ]);
  });

  const errorWithoutTrace = (body: {
    error: Record<string, unknown>;
  }): Record<string, unknown> => {
    const { trace_id, ...error } = body.error;
    expect(trace_id).toEqual(expect.any(String));
    return error;
  };

  describe('/securities/{symbol} market history reads', () => {
    it('returns canonical detail from a lowercase symbol', async () => {
      const response = await request(app.getHttpServer())
        .get('/securities/jkh.n0000')
        .expect(200);

      expect(response.body).toEqual({
        data: {
          symbol: 'JKH.N0000',
          company_name: 'John Keells Holdings PLC',
          cse_code: 'JKH.N0000',
          sector: { gics_code: '2010', name: 'Capital Goods' },
          shares_outstanding: 1513637385,
          data_from: '2025-01-02',
          data_to: '2025-01-10',
          listing_status: 'listed',
          latest: {
            trade_date: '2025-01-10',
            close: 22.73,
            change: 0.38,
            change_pct: 1.7,
            volume: 1571980,
          },
          ratios: null,
        },
      });
    });

    it('returns inclusive daily bars in ascending order', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/securities/JKH.N0000/ohlcv' +
            '?timeframe=daily&from=2025-01-02&to=2025-01-03',
        )
        .expect(200);

      expect(response.body).toEqual({
        data: {
          symbol: 'JKH.N0000',
          timeframe: 'daily',
          from: '2025-01-02',
          to: '2025-01-03',
          bars: [
            {
              date: '2025-01-02',
              open: 22.48,
              high: 22.59,
              low: 22.13,
              close: 22.43,
              adjusted_close: null,
              volume: 1631334,
            },
            {
              date: '2025-01-03',
              open: 22.41,
              high: 22.69,
              low: 22.25,
              close: 22.32,
              adjusted_close: null,
              volume: 785056,
            },
          ],
        },
      });
    });

    it('returns deterministic weekly aggregates and excludes partial periods', async () => {
      const complete = await request(app.getHttpServer())
        .get(
          '/securities/JKH.N0000/ohlcv' +
            '?timeframe=weekly&from=2024-12-30&to=2025-01-10',
        )
        .expect(200);

      expect(complete.body.data.bars).toEqual([
        {
          period_start: '2024-12-30',
          period_end: '2025-01-03',
          open: 22.48,
          high: 22.69,
          low: 22.13,
          close: 22.32,
          volume: 2416390,
        },
        {
          period_start: '2025-01-06',
          period_end: '2025-01-10',
          open: 22.43,
          high: 22.84,
          low: 21.75,
          close: 22.73,
          volume: 5186409,
        },
      ]);

      const partial = await request(app.getHttpServer())
        .get(
          '/securities/JKH.N0000/ohlcv' +
            '?timeframe=weekly&from=2025-01-02&to=2025-01-10',
        )
        .expect(200);
      expect(partial.body.data.bars).toEqual([complete.body.data.bars[1]]);
    });

    it('returns deterministic monthly aggregates', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/securities/JKH.N0000/ohlcv' +
            '?timeframe=monthly&from=2025-01-01&to=2025-01-31',
        )
        .expect(200);

      expect(response.body.data.bars).toEqual([
        {
          period_start: '2025-01-01',
          period_end: '2025-01-10',
          open: 22.48,
          high: 22.84,
          low: 21.75,
          close: 22.73,
          volume: 7602799,
        },
      ]);
    });

    it('resolves the default daily range from the latest market date', async () => {
      const response = await request(app.getHttpServer())
        .get('/securities/JKH.N0000/ohlcv')
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          symbol: 'JKH.N0000',
          timeframe: 'daily',
          from: '2024-01-10',
          to: '2025-01-10',
        }),
      );
      expect(response.body.data.bars).toHaveLength(7);
      expect(response.body.data.bars[0].date).toBe('2025-01-02');
      expect(response.body.data.bars[6].date).toBe('2025-01-10');
    });

    it('returns no data for a valid pre-listing range', async () => {
      const response = await request(app.getHttpServer())
        .get('/securities/JKH.N0000/ohlcv' + '?from=2024-01-01&to=2024-01-31')
        .expect(200);

      expect(response.body.data.bars).toEqual([]);
      expect(response.body.data.from).toBe('2024-01-01');
      expect(response.body.data.to).toBe('2024-01-31');
    });

    it('returns SECURITY_NOT_FOUND for unknown detail and OHLCV symbols', async () => {
      for (const path of [
        '/securities/NOPE.X0000',
        '/securities/NOPE.X0000/ohlcv',
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .expect(404);
        expect(errorWithoutTrace(response.body)).toEqual({
          code: 'SECURITY_NOT_FOUND',
          message: 'Security not found.',
        });
      }
    });

    it.each([
      ['/securities/JKH.N0000/ohlcv?timeframe=hourly', 'timeframe'],
      ['/securities/JKH.N0000/ohlcv?from=2025-02-30', 'from'],
      ['/securities/JKH.N0000/ohlcv?from=2025-01-10&to=2025-01-01', 'from'],
      [`/securities/${'A'.repeat(21)}`, 'symbol'],
    ])('returns the validation envelope for %s', async (path, field) => {
      const response = await request(app.getHttpServer()).get(path).expect(400);
      const error = errorWithoutTrace(response.body);

      expect(error).toEqual(
        expect.objectContaining({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
        }),
      );
      expect(error.fields).toEqual([expect.objectContaining({ field })]);
    });
  });

  // docs/api/endpoint-catalogue-v0.md §§9–10, against the seeded ASPI and
  // S&P SL20 closes for 2025-01-02 to 2025-01-10.
  describe('/indices reads', () => {
    it('lists each index with its latest close and change', async () => {
      const response = await request(app.getHttpServer())
        .get('/indices')
        .expect(200);

      expect(response.body).toEqual({
        data: [
          {
            code: 'ASPI',
            name: 'All Share Price Index',
            latest: {
              date: '2025-01-10',
              close: 15736.91,
              previous_date: '2025-01-09',
              change: -87.4,
              change_pct: -0.55,
            },
          },
          {
            code: 'SL20',
            name: 'S&P Sri Lanka 20',
            latest: {
              date: '2025-01-10',
              close: 4734.44,
              previous_date: '2025-01-09',
              change: -27.87,
              change_pct: -0.59,
            },
          },
        ],
      });
    });

    it('settles an as_of on a weekend to the latest close before it', async () => {
      const response = await request(app.getHttpServer())
        .get('/indices?as_of=2025-01-05')
        .expect(200);

      expect(response.body.data[0].latest).toEqual({
        date: '2025-01-03',
        close: 15845.06,
        previous_date: '2025-01-02',
        change: -84.71,
        change_pct: -0.53,
      });
    });

    it('returns an inclusive ascending series for a case-insensitive code', async () => {
      const response = await request(app.getHttpServer())
        .get('/indices/sl20/values?from=2025-01-02&to=2025-01-03')
        .expect(200);

      expect(response.body).toEqual({
        data: {
          code: 'SL20',
          name: 'S&P Sri Lanka 20',
          from: '2025-01-02',
          to: '2025-01-03',
          values: [
            { date: '2025-01-02', close: 4732.06 },
            { date: '2025-01-03', close: 4732.58 },
          ],
        },
      });
    });

    it('defaults to the year ending at the latest index date', async () => {
      const response = await request(app.getHttpServer())
        .get('/indices/ASPI/values')
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({ from: '2024-01-10', to: '2025-01-10' }),
      );
      expect(response.body.data.values).toHaveLength(7);
    });

    it('returns an empty series for a range with no data', async () => {
      const response = await request(app.getHttpServer())
        .get('/indices/ASPI/values?from=2024-01-01&to=2024-01-31')
        .expect(200);

      expect(response.body.data.values).toEqual([]);
    });

    it('matches the whole code, never a prefix', async () => {
      for (const path of ['/indices/NOPE/values', '/indices/SL/values']) {
        const response = await request(app.getHttpServer())
          .get(path)
          .expect(404);
        expect(errorWithoutTrace(response.body)).toEqual({
          code: 'INDEX_NOT_FOUND',
          message: 'Index not found.',
        });
      }
    });

    it.each([
      ['/indices?as_of=2025-02-30', 'as_of'],
      ['/indices/ASPI/values?from=2025-01-10&to=2025-01-01', 'from'],
      [`/indices/${'A'.repeat(21)}/values`, 'code'],
    ])('returns the validation envelope for %s', async (path, field) => {
      const response = await request(app.getHttpServer()).get(path).expect(400);
      const error = errorWithoutTrace(response.body);

      expect(error).toEqual(
        expect.objectContaining({ code: 'VALIDATION_FAILED' }),
      );
      expect(error.fields).toEqual([expect.objectContaining({ field })]);
    });
  });

  // docs/api/paper-trading-v1.md §2.3, §2.4 — the quote and valuation rules
  // the order and portfolio paths price against.
  //
  // Called on the service rather than over HTTP: both callers now live in this
  // process, so there are no internal endpoints left to request. The point of
  // these cases is unchanged, and it is not the transport — the service unit
  // tests mock manager.query, so this is the only place the quote and
  // valuation SQL actually runs against seeded data.
  describe('paper-trading quotes (§2.3)', () => {
    const quote = (symbol: string) => quotes.getQuote(symbol);

    it('returns the contract worked example verbatim', async () => {
      // This is the §2.3 sample response. The seeded fixture was built to
      // match it, so any drift in pricing, session resolution or T+2
      // settlement shows up here as a diff against the published contract.
      await expect(quote('COMB.N0000')).resolves.toEqual({
        symbol: 'COMB.N0000',
        listing_status: 'listed',
        market_as_of: '2025-01-10',
        price_as_of: '2025-01-10',
        close: 142.72,
        settlement_date: '2025-01-14',
      });
    });

    it('settles T+2 across the weekend', async () => {
      // 2025-01-10 is a Friday, so settlement is Tuesday the 14th, not the
      // 12th. Asserted separately because it is the rule most likely to be
      // broken by a refactor of the calendar walk.
      const result = await quote('HNB.N0000');

      expect(result.market_as_of).toBe('2025-01-10');
      expect(result.settlement_date).toBe('2025-01-14');
    });

    it('matches the symbol case-insensitively and echoes the canonical form', async () => {
      // The SPA sends whatever the user typed; canonical symbols are what the
      // stored records carry.
      const result = await quote('comb.n0000');

      expect(result.symbol).toBe('COMB.N0000');
      expect(result.close).toBe(142.72);
    });

    it('prices every seeded security at the same market session', async () => {
      // One shared session is what makes fills comparable across orders.
      const symbols = [
        'COMB.N0000',
        'HNB.N0000',
        'SAMP.N0000',
        'JKH.N0000',
        'DIAL.N0000',
        'CTC.N0000',
      ];

      const results = await Promise.all(symbols.map((s) => quote(s)));

      expect(results.map((q) => q.market_as_of)).toEqual(
        symbols.map(() => '2025-01-10'),
      );
      // Every fixture security trades on the last session, so none is stale.
      expect(results.every((q) => q.price_as_of === q.market_as_of)).toBe(true);
      expect(results.every((q) => typeof q.close === 'number')).toBe(true);
    });

    it('throws SECURITY_NOT_FOUND for an unknown symbol', async () => {
      await expect(quote('NOPE.X0000')).rejects.toMatchObject({
        code: 'SECURITY_NOT_FOUND',
        message: 'Security not found.',
      });
    });

    // §6.2 — the order path needs the absence as a value, not an exception, so
    // it can persist a rejected order rather than fail the request.
    it('reports an unknown symbol as not found rather than throwing', async () => {
      await expect(quotes.findQuote('NOPE.X0000')).resolves.toEqual({
        found: false,
      });
      await expect(quotes.findQuote('comb.n0000')).resolves.toMatchObject({
        found: true,
        quote: { symbol: 'COMB.N0000' },
      });
    });

    it('is deterministic across repeated calls', async () => {
      const first = await quote('CTC.N0000');
      const second = await quote('CTC.N0000');

      expect(second).toEqual(first);
    });
  });

  it('prices a set of symbols at one session (§2.4)', async () => {
    await expect(
      quotes.getValuations(
        ['JKH.N0000', 'comb.n0000', 'NOPE.X0000'],
        '2025-01-05',
      ),
    ).resolves.toEqual({
      // 2025-01-05 is a Sunday; it settles back to the seeded session.
      as_of: '2025-01-03',
      prices: [
        // Case-folded on the way in, canonical on the way out.
        { symbol: 'COMB.N0000', close: 147.15 },
        { symbol: 'JKH.N0000', close: 22.32 },
        // Unknown and unpriced are the same outcome here (§2.4).
        { symbol: 'NOPE.X0000', close: null },
      ],
    });
  });

  it('returns the session with no symbols (§2.4)', async () => {
    await expect(quotes.getValuations([], '2025-01-05')).resolves.toEqual({
      as_of: '2025-01-03',
      prices: [],
    });
  });

  it('rejects an as_of outside the data (§2.4)', async () => {
    await expect(
      quotes.getValuations(['JKH.N0000'], '2030-01-01'),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: [expect.objectContaining({ field: 'as_of' })],
    });
  });

  describe('/internal/v1/ingestions/eod', () => {
    const symbol = 'TEST.N0000';
    const tradeDate = '2025-01-13';
    const batchId = 'a'.repeat(64);
    const staleBatchId = 'c'.repeat(64);
    const prices = [
      {
        symbol,
        open: '10.0000',
        high: '12.0000',
        low: '9.5000',
        close: '11.2500',
        volume: '1234',
        validation_warnings: [],
        ohlc_repaired: false,
      },
    ];
    const body = {
      contract_version: '1',
      batch_id: batchId,
      trade_date: tradeDate,
      source: {
        name: 'contract_fixture',
        captured_at: '2025-01-13T09:20:00Z',
        source_date_method: 'fixture_date',
        raw_payload_hash: 'b'.repeat(64),
      },
      calendar: {
        is_trading_day: true,
        source: 'e2e fixture',
        verified_at: '2025-01-01T00:00:00Z',
      },
      validation: { processed: 1, accepted: 1, rejected: 0, repaired: 0 },
      securities: [{ symbol, company_name: 'Test Security PLC' }],
      prices,
      market_digest: calculateMarketDigest(prices),
    };

    afterAll(async () => {
      const db = app.get(DataSource);
      await db.query(
        `DELETE FROM market_data.price_aggregates
         WHERE security_id IN (
           SELECT security_id FROM market_data.securities WHERE symbol = $1
         )`,
        [symbol],
      );
      await db.query(
        `DELETE FROM market_data.daily_prices
         WHERE security_id IN (
           SELECT security_id FROM market_data.securities WHERE symbol = $1
         )`,
        [symbol],
      );
      await db.query(`DELETE FROM market_data.securities WHERE symbol = $1`, [
        symbol,
      ]);
      await db.query(
        `DELETE FROM market_data.ingestion_runs WHERE batch_id = ANY($1::text[])`,
        [[batchId, staleBatchId]],
      );
      await db.query(
        `DELETE FROM market_data.trading_calendar WHERE trade_date = $1::date`,
        [tradeDate],
      );
    });

    it('requires the machine bearer token', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .send(body)
        .expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('commits a batch atomically and exposes it through trading quotes', async () => {
      const created = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .send(body)
        .expect(201);

      expect(created.body.data).toEqual(
        expect.objectContaining({
          batch_id: batchId,
          trade_date: tradeDate,
          records_accepted: 1,
          replayed: false,
        }),
      );

      await expect(quotes.getQuote(symbol)).resolves.toEqual(
        expect.objectContaining({
          symbol,
          market_as_of: tradeDate,
          price_as_of: tradeDate,
          close: 11.25,
        }),
      );

      const replay = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .send(body)
        .expect(201);
      expect(replay.body.data.replayed).toBe(true);

      const latest = await request(app.getHttpServer())
        .get('/internal/v1/ingestions/eod/latest')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .expect(200);
      expect(latest.body.data.batch_id).toBe(batchId);

      const staleSnapshot = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .send({
          ...body,
          batch_id: staleBatchId,
          trade_date: '2025-01-14',
          source: {
            ...body.source,
            captured_at: '2025-01-14T09:20:00Z',
          },
        })
        .expect(400);
      expect(staleSnapshot.body.error).toEqual(
        expect.objectContaining({
          code: 'VALIDATION_FAILED',
          fields: expect.arrayContaining([
            expect.objectContaining({ field: 'market_digest' }),
          ]),
        }),
      );
    });
  });
});

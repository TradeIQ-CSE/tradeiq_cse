import { randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';

// docs/api/analytics-v1.md, against the seeded sample. History is written
// straight into the tables so a multi-day portfolio can be checked against
// the sample's own closes without driving the order path day by day.
describe('Analytics (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let signer: TestSigner;

  const SYMBOL = 'JKH.N0000';
  let sessions: { date: string; close: number }[];

  beforeAll(async () => {
    signer = createTestSigner();
    process.env.AUTH_JWT_PUBLIC_KEYS = signer.publicKeys;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    const rows: { trade_date: string; close: string }[] =
      await dataSource.query(
        `SELECT to_char(dp.trade_date, 'YYYY-MM-DD') AS trade_date, dp.close
       FROM market_data.daily_prices dp
       JOIN market_data.securities s USING (security_id)
       WHERE s.symbol = $1 ORDER BY dp.trade_date`,
        [SYMBOL],
      );
    sessions = rows.map((row) => ({
      date: row.trade_date,
      close: Number(row.close),
    }));
  });

  afterAll(async () => {
    await dataSource.query(
      'TRUNCATE market_data.cash_transactions, market_data.fills, market_data.paper_orders, market_data.virtual_portfolios, market_data.backtest_results, market_data.backtest_runs CASCADE',
    );
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE market_data.cash_transactions, market_data.fills, market_data.paper_orders, market_data.virtual_portfolios, market_data.backtest_results, market_data.backtest_runs CASCADE',
    );
  });

  const server = () => app.getHttpServer();
  const get = (path: string, token: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);

  async function seedPortfolio(userId: string) {
    const portfolioId = randomUUID();
    await dataSource.query(
      `INSERT INTO market_data.virtual_portfolios
         (portfolio_id, user_id, name, starting_capital, cash_balance, created_at)
       VALUES ($1, $2, 'Test', 1000000, 1000000, now())`,
      [portfolioId, userId],
    );
    await dataSource.query(
      `INSERT INTO market_data.cash_transactions
         (transaction_id, portfolio_id, transaction_type, amount, effective_date, balance_after)
       VALUES ($1, $2, 'initial_capital', 1000000, $3::date, 1000000)`,
      [randomUUID(), portfolioId, sessions[0].date],
    );
    return portfolioId;
  }

  async function fill(
    portfolioId: string,
    side: 'buy' | 'sell',
    quantity: number,
    session: { date: string; close: number },
  ) {
    const orderId = randomUUID();
    const fillId = randomUUID();
    const gross = quantity * session.close;
    await dataSource.query(
      `INSERT INTO market_data.paper_orders
         (order_id, portfolio_id, symbol, side, order_type, quantity, filled_quantity, status)
       VALUES ($1, $2, $3, $4, 'market', $5, $5, 'filled')`,
      [orderId, portfolioId, SYMBOL, side, quantity],
    );
    await dataSource.query(
      `INSERT INTO market_data.fills
         (fill_id, order_id, portfolio_id, symbol, fill_date, settlement_date,
          quantity, fill_price, gross_consideration, fee_total)
       VALUES ($1, $2, $3, $4, $5::date, $5::date, $6, $7, $8, 0)`,
      [
        fillId,
        orderId,
        portfolioId,
        SYMBOL,
        session.date,
        quantity,
        session.close,
        gross,
      ],
    );
    await dataSource.query(
      `INSERT INTO market_data.cash_transactions
         (transaction_id, portfolio_id, transaction_type, amount, related_fill_id,
          effective_date, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6::date, 0)`,
      [
        randomUUID(),
        portfolioId,
        side === 'buy' ? 'buy_debit' : 'sell_credit',
        side === 'buy' ? -gross : gross,
        fillId,
        session.date,
      ],
    );
  }

  it('requires a signed-in user', async () => {
    await request(server()).get('/analytics/backtests').expect(401);
  });

  describe('portfolio performance', () => {
    it('values the portfolio at each close from what it held that day', async () => {
      const userId = randomUUID();
      const token = signer.sign({ sub: userId });
      const portfolioId = await seedPortfolio(userId);
      await fill(portfolioId, 'buy', 100, sessions[1]);
      await fill(portfolioId, 'sell', 40, sessions[3]);

      const response = await get(
        `/analytics/portfolios/${portfolioId}/performance`,
        token,
      ).expect(200);
      const { data } = response.body;

      expect(data.start_date).toBe(sessions[0].date);
      expect(data.points.map((p: { date: string }) => p.date)).toEqual(
        sessions.map((s) => s.date),
      );

      sessions.forEach((session, index) => {
        let cash = 1_000_000;
        let held = 0;
        if (index >= 1) {
          cash -= 100 * sessions[1].close;
          held += 100;
        }
        if (index >= 3) {
          cash += 40 * sessions[3].close;
          held -= 40;
        }
        const expected = cash + held * session.close;
        const point = data.points[index];
        expect(point.value).toBeCloseTo(expected, 2);
        expect(point.return_pct).toBeCloseTo(
          (expected / 1_000_000 - 1) * 100,
          2,
        );
      });

      // Every benchmark starts from zero on the first day.
      expect(data.points[0].benchmarks.ASPI).toBe(0);
      expect(data.benchmarks.map((b: { code: string }) => b.code)).toContain(
        'ASPI',
      );
    });

    it('measures ASPI from the first day', async () => {
      const userId = randomUUID();
      const token = signer.sign({ sub: userId });
      const portfolioId = await seedPortfolio(userId);

      const response = await get(
        `/analytics/portfolios/${portfolioId}/performance`,
        token,
      ).expect(200);
      const levels: { trade_date: string; index_value: string }[] =
        await dataSource.query(
          `SELECT to_char(trade_date, 'YYYY-MM-DD') AS trade_date, index_value
         FROM market_data.index_values WHERE index_code = 'ASPI' ORDER BY trade_date`,
        );
      const base = Number(
        [...levels].reverse().find((l) => l.trade_date <= sessions[0].date)
          ?.index_value,
      );
      const last = response.body.data.points.at(-1);
      const lastLevel = Number(
        [...levels].reverse().find((l) => l.trade_date <= last.date)
          ?.index_value,
      );
      expect(last.benchmarks.ASPI).toBeCloseTo((lastLevel / base - 1) * 100, 2);
    });

    it('hides another user’s portfolio behind the same 404', async () => {
      const portfolioId = await seedPortfolio(randomUUID());
      const stranger = signer.sign({ sub: randomUUID() });
      const response = await get(
        `/analytics/portfolios/${portfolioId}/performance`,
        stranger,
      ).expect(404);
      expect(response.body.error.code).toBe('PORTFOLIO_NOT_FOUND');
    });
  });

  describe('backtests', () => {
    async function seedRun(ownerId: string, withResult: boolean) {
      const runId = randomUUID();
      await dataSource.query(
        `INSERT INTO market_data.backtest_runs
           (id, owner_id, status, symbol, start_date, end_date, starting_capital,
            rule_config, execution_assumptions)
         VALUES ($1, $2, $3, $4, $5::date, $6::date, 100, '{}', '{}')`,
        [
          runId,
          ownerId,
          withResult ? 'completed' : 'queued',
          SYMBOL,
          sessions[0].date,
          sessions.at(-1)!.date,
        ],
      );
      if (withResult) {
        const curve = [100, 120, 90, 110].map((totalEquity, index) => ({
          date: sessions[index].date,
          cash: 0,
          positionQuantity: 0,
          positionMarketValue: 0,
          totalEquity,
        }));
        await dataSource.query(
          `INSERT INTO market_data.backtest_results
             (id, backtest_run_id, symbol, summary_metrics, trade_ledger, equity_curve)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            runId,
            SYMBOL,
            JSON.stringify({
              initialCapital: 100,
              finalCash: 110,
              finalEquity: 110,
              totalReturnPct: 10.004,
            }),
            JSON.stringify([{ id: 1 }, { id: 2 }]),
            JSON.stringify(curve),
          ],
        );
      }
      return runId;
    }

    it('lists the caller’s runs with their figures and the market over the same dates', async () => {
      const userId = randomUUID();
      const token = signer.sign({ sub: userId });
      await seedRun(userId, true);
      await seedRun(randomUUID(), true);

      const response = await get('/analytics/backtests', token).expect(200);
      expect(response.body.meta.total).toBe(1);
      const [run] = response.body.data;
      expect(run).toMatchObject({
        status: 'completed',
        symbol: SYMBOL,
        company_name: expect.any(String),
        start_date: sessions[0].date,
        final_equity: 110,
        total_return_pct: 10,
        trade_count: 2,
        max_drawdown_pct: -25,
      });
      expect(typeof run.aspi_return_pct).toBe('number');
    });

    it('lists an unfinished run with empty figures', async () => {
      const userId = randomUUID();
      await seedRun(userId, false);
      const response = await get(
        '/analytics/backtests',
        signer.sign({ sub: userId }),
      ).expect(200);
      expect(response.body.data[0]).toMatchObject({
        status: 'queued',
        final_equity: null,
        total_return_pct: null,
        trade_count: null,
        max_drawdown_pct: null,
      });
    });
  });
});

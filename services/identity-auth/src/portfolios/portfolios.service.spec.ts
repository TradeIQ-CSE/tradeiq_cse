import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VirtualPortfolio } from '../entities/virtual-portfolio.entity';
import {
  IdempotencyKeyReusedException,
  PortfolioNotFoundException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { MarketTradingClient } from '../market-trading/market-trading.client';
import { PortfoliosService } from './portfolios.service';

describe('PortfoliosService', () => {
  let service: PortfoliosService;
  let repoManagerQuery: jest.Mock;
  let txManagerQuery: jest.Mock;
  let dataSourceTransaction: jest.Mock;
  let getValuations: jest.Mock;

  const userId = 'a1a1a1a1-1111-4111-8111-111111111111';
  const portfolioId = 'b2b2b2b2-2222-4222-8222-222222222222';

  beforeEach(async () => {
    repoManagerQuery = jest.fn();
    txManagerQuery = jest.fn();
    dataSourceTransaction = jest.fn((cb: (manager: unknown) => unknown) =>
      cb({ query: txManagerQuery }),
    );
    getValuations = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfoliosService,
        {
          provide: getRepositoryToken(VirtualPortfolio),
          useValue: { manager: { query: repoManagerQuery } },
        },
        {
          provide: DataSource,
          useValue: { transaction: dataSourceTransaction },
        },
        {
          provide: MarketTradingClient,
          useValue: { getValuations },
        },
      ],
    }).compile();

    service = module.get(PortfoliosService);
  });

  describe('create', () => {
    const dto = { name: 'Evaluation portfolio', starting_capital: 1000000 };

    it('rejects a missing Idempotency-Key header without starting a transaction', async () => {
      await expect(
        service.create(userId, dto, undefined),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(dataSourceTransaction).not.toHaveBeenCalled();
    });

    // The idempotency_key CHECK constraint would otherwise surface as a 500
    // instead of the 400 the contract requires (§9.1).
    it.each(['short', 'x'.repeat(129), 'has\nnewline'])(
      'rejects a malformed Idempotency-Key before starting a transaction: %s',
      async (key) => {
        await expect(service.create(userId, dto, key)).rejects.toBeInstanceOf(
          ValidationFailedException,
        );
        expect(dataSourceTransaction).not.toHaveBeenCalled();
      },
    );

    it('atomically creates the portfolio and one opening cash transaction', async () => {
      txManagerQuery
        .mockResolvedValueOnce([{ idempotency_record_id: 'reserved-id' }]) // reserve
        .mockResolvedValueOnce([]) // insert portfolio
        .mockResolvedValueOnce([]) // insert cash transaction
        .mockResolvedValueOnce([]); // complete idempotency record

      const { body, replayed } = await service.create(userId, dto, 'key-12345');

      expect(replayed).toBe(false);
      expect(body).toMatchObject({
        name: 'Evaluation portfolio',
        currency: 'LKR',
        starting_capital: 1000000,
        cash_balance: 1000000,
        status: 'active',
      });
      expect(txManagerQuery).toHaveBeenCalledTimes(4);
      expect(txManagerQuery.mock.calls[1][0]).toContain(
        'INSERT INTO auth.virtual_portfolios',
      );
      expect(txManagerQuery.mock.calls[2][0]).toContain(
        'INSERT INTO auth.cash_transactions',
      );
      expect(txManagerQuery.mock.calls[2][0]).toContain('initial_capital');
    });

    it('replays the stored response for a repeated identical request', async () => {
      const storedBody = { portfolio_id: 'existing', name: dto.name };
      // The reserve INSERT hits the unique constraint (no row returned), so
      // the service falls back to reading the row the first attempt wrote —
      // matching its own request_hash exactly, since it's the same request.
      let insertedHash = '';
      txManagerQuery.mockImplementation(
        async (sql: string, params: unknown[]) => {
          if (sql.includes('INSERT INTO auth.idempotency_records')) {
            insertedHash = params[5] as string;
            return [];
          }
          if (sql.includes('SELECT request_hash, response_body')) {
            return [{ request_hash: insertedHash, response_body: storedBody }];
          }
          throw new Error(`unexpected query in replay test: ${sql}`);
        },
      );

      const result = await service.create(userId, dto, 'key-12345');

      expect(result.replayed).toBe(true);
      expect(result.body).toEqual(storedBody);
      expect(txManagerQuery).toHaveBeenCalledTimes(2);
    });

    it('rejects a reused key with a different request', async () => {
      txManagerQuery
        .mockResolvedValueOnce([]) // reserve: conflict
        .mockResolvedValueOnce([
          { request_hash: 'some-other-hash', response_body: { any: true } },
        ]);

      await expect(
        service.create(userId, dto, 'key-12345'),
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedException);
      expect(txManagerQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('get', () => {
    it('throws PortfolioNotFoundException when the row is missing, deleted or owned by another user', async () => {
      repoManagerQuery.mockResolvedValueOnce([]);

      await expect(service.get(userId, portfolioId)).rejects.toBeInstanceOf(
        PortfolioNotFoundException,
      );
    });

    it('maps an owned row into the wire shape', async () => {
      repoManagerQuery.mockResolvedValueOnce([
        {
          portfolio_id: portfolioId,
          name: 'Evaluation portfolio',
          starting_capital: '1000000.0000',
          cash_balance: '898880.0000',
          created_at: new Date('2026-08-27T13:00:00Z'),
          deleted_at: null,
        },
      ]);

      const result = await service.get(userId, portfolioId);

      expect(result).toEqual({
        portfolio_id: portfolioId,
        name: 'Evaluation portfolio',
        currency: 'LKR',
        starting_capital: 1000000,
        cash_balance: 898880,
        status: 'active',
        created_at: '2026-08-27T13:00:00.000Z',
      });
    });
  });

  describe('remove', () => {
    it('throws PortfolioNotFoundException when nothing matched', async () => {
      repoManagerQuery.mockResolvedValueOnce([]);

      await expect(service.remove(userId, portfolioId)).rejects.toBeInstanceOf(
        PortfolioNotFoundException,
      );
    });

    it('resolves when the soft delete matched one row', async () => {
      repoManagerQuery.mockResolvedValueOnce([{ portfolio_id: portfolioId }]);

      await expect(
        service.remove(userId, portfolioId),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns paginated portfolios ordered by created_at desc', async () => {
      repoManagerQuery
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([
          {
            portfolio_id: portfolioId,
            name: 'Evaluation portfolio',
            starting_capital: '1000000.0000',
            cash_balance: '1000000.0000',
            created_at: new Date('2026-08-27T13:00:00Z'),
            deleted_at: null,
          },
        ]);

      const result = await service.list(userId, { page: 1, page_size: 50 });

      expect(result.meta).toEqual({ page: 1, page_size: 50, total: 1 });
      expect(result.data[0].portfolio_id).toBe(portfolioId);
      expect(repoManagerQuery.mock.calls[1][0]).toContain(
        'ORDER BY created_at DESC, portfolio_id ASC',
      );
    });
  });

  describe('listCashTransactions', () => {
    it('throws PortfolioNotFoundException before querying the ledger when unowned', async () => {
      repoManagerQuery.mockResolvedValueOnce([]); // findOwned

      await expect(
        service.listCashTransactions(userId, portfolioId, {
          page: 1,
          page_size: 50,
        }),
      ).rejects.toBeInstanceOf(PortfolioNotFoundException);
      expect(repoManagerQuery).toHaveBeenCalledTimes(1);
    });

    it('maps ledger rows into the wire shape', async () => {
      repoManagerQuery
        .mockResolvedValueOnce([
          {
            portfolio_id: portfolioId,
            name: 'x',
            starting_capital: '1000000',
            cash_balance: '898880',
            created_at: new Date(),
            deleted_at: null,
          },
        ]) // findOwned
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([
          {
            transaction_id: 'txn-1',
            transaction_type: 'initial_capital',
            amount: '1000000.0000',
            balance_after: '1000000.0000',
            // node-postgres hands back `date` columns as local-midnight Date
            // objects; formatting via toISOString() would report 2026-08-26
            // in any zone east of UTC.
            effective_date: new Date(2026, 7, 27),
            related_fill_id: null,
            created_at: new Date('2026-08-27T13:00:00Z'),
          },
        ]);

      const result = await service.listCashTransactions(userId, portfolioId, {
        page: 1,
        page_size: 50,
      });

      expect(result.data[0]).toEqual({
        transaction_id: 'txn-1',
        type: 'initial_capital',
        amount: 1000000,
        balance_after: 1000000,
        effective_date: '2026-08-27',
        fill_id: null,
        created_at: '2026-08-27T13:00:00.000Z',
      });
    });
  });
});

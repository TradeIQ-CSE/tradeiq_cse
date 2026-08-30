import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { VirtualPortfolio } from '../entities/virtual-portfolio.entity';
import {
  IdempotencyScope,
  assertValidIdempotencyKey,
  completeIdempotencyKey,
  hashCanonicalRequest,
  reserveIdempotencyKey,
} from '../common/idempotency/idempotency';
import { PortfolioNotFoundException } from '../common/errors/api-exception';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { ListPortfoliosQueryDto } from './dto/list-portfolios-query.dto';
import { ListCashTransactionsQueryDto } from './dto/list-cash-transactions-query.dto';

export interface PortfolioResponse {
  portfolio_id: string;
  name: string;
  currency: 'LKR';
  starting_capital: number;
  cash_balance: number;
  status: 'active' | 'deleted';
  created_at: string;
}

export interface CashTransactionResponse {
  transaction_id: string;
  type: string;
  amount: number;
  balance_after: number;
  effective_date: string;
  fill_id: string | null;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number };
}

// Raw row shapes from the hand-written queries below. numeric columns come
// back as strings from the pg driver; timestamptz comes back as a JS Date.
interface RawPortfolioRow {
  portfolio_id: string;
  name: string;
  starting_capital: string;
  cash_balance: string;
  created_at: Date | string;
  deleted_at: Date | string | null;
}

interface RawCashTransactionRow {
  transaction_id: string;
  transaction_type: string;
  amount: string;
  balance_after: string;
  effective_date: Date | string;
  related_fill_id: string | null;
  created_at: Date | string;
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

// The API contract fixes dates at YYYY-MM-DD. node-postgres returns `date`
// columns as Date objects at local midnight, so format them from the local
// getters: toISOString() would apply a UTC conversion that moves the calendar
// day in any zone east of UTC (mirrors market-trading's common/market-date.ts).
function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

@Injectable()
export class PortfoliosService {
  constructor(
    @InjectRepository(VirtualPortfolio)
    private readonly portfolios: Repository<VirtualPortfolio>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // docs/api/paper-trading-v1.md §5.1 — atomically writes the portfolio and
  // exactly one initial_capital cash transaction, guarded by a reserve-then-
  // fill idempotency check inside the same transaction.
  async create(
    userId: string,
    dto: CreatePortfolioDto,
    idempotencyKey: string | undefined,
  ): Promise<{ body: PortfolioResponse; replayed: boolean }> {
    assertValidIdempotencyKey(idempotencyKey);

    const requestHash = hashCanonicalRequest({
      name: dto.name,
      starting_capital: dto.starting_capital,
    });
    const scope: IdempotencyScope = {
      userId,
      method: 'POST',
      route: '/portfolios',
      idempotencyKey,
    };

    return this.dataSource.transaction(async (manager) => {
      const reservation = await reserveIdempotencyKey(
        manager,
        scope,
        requestHash,
      );
      if (reservation.replayed) {
        return { body: reservation.body as PortfolioResponse, replayed: true };
      }

      const now = new Date();
      const portfolioId = randomUUID();
      await manager.query(
        `INSERT INTO auth.virtual_portfolios
           (portfolio_id, user_id, name, starting_capital, cash_balance, created_at)
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [portfolioId, userId, dto.name, dto.starting_capital, now],
      );

      const transactionId = randomUUID();
      await manager.query(
        `INSERT INTO auth.cash_transactions
           (transaction_id, portfolio_id, transaction_type, amount, effective_date, balance_after, created_at)
         VALUES ($1, $2, 'initial_capital', $3, $4::date, $3, $5)`,
        // effective_date is sent as an explicit YYYY-MM-DD rather than casting
        // the timestamp server-side, which would resolve the calendar day in
        // the database's timezone instead of the application's.
        [transactionId, portfolioId, dto.starting_capital, toIsoDate(now), now],
      );

      const body: PortfolioResponse = {
        portfolio_id: portfolioId,
        name: dto.name,
        currency: 'LKR',
        starting_capital: dto.starting_capital,
        cash_balance: dto.starting_capital,
        status: 'active',
        created_at: now.toISOString(),
      };

      await completeIdempotencyKey(
        manager,
        reservation.recordId,
        HttpStatus.CREATED,
        body,
        portfolioId,
      );

      return { body, replayed: false };
    });
  }

  // docs/api/paper-trading-v1.md §5.2
  async list(
    userId: string,
    query: ListPortfoliosQueryDto,
  ): Promise<PaginatedResult<PortfolioResponse>> {
    const countRows: { total: string }[] = await this.portfolios.manager.query(
      `SELECT COUNT(*)::text AS total FROM auth.virtual_portfolios
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
    );

    const rows: RawPortfolioRow[] = await this.portfolios.manager.query(
      `SELECT portfolio_id, name, starting_capital, cash_balance, created_at, deleted_at
       FROM auth.virtual_portfolios
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, portfolio_id ASC
       LIMIT $2 OFFSET $3`,
      [userId, query.page_size, (query.page - 1) * query.page_size],
    );

    return {
      data: rows.map((row) => this.toPortfolioResponse(row)),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(countRows[0].total),
      },
    };
  }

  // docs/api/paper-trading-v1.md §5.3 — missing, deleted or other-user
  // portfolios all resolve to the same 404 via findOwned.
  async get(userId: string, portfolioId: string): Promise<PortfolioResponse> {
    const row = await this.findOwned(userId, portfolioId);
    return this.toPortfolioResponse(row);
  }

  // docs/api/paper-trading-v1.md §5.4 — soft delete; the WHERE clause and the
  // 404 check happen in one statement so there's no read-then-write race.
  async remove(userId: string, portfolioId: string): Promise<void> {
    const rows: { portfolio_id: string }[] =
      await this.portfolios.manager.query(
        `UPDATE auth.virtual_portfolios SET deleted_at = now()
       WHERE portfolio_id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING portfolio_id`,
        [portfolioId, userId],
      );
    if (rows.length === 0) {
      throw new PortfolioNotFoundException();
    }
  }

  // docs/api/paper-trading-v1.md §5.5
  async listCashTransactions(
    userId: string,
    portfolioId: string,
    query: ListCashTransactionsQueryDto,
  ): Promise<PaginatedResult<CashTransactionResponse>> {
    await this.findOwned(userId, portfolioId);

    const countRows: { total: string }[] = await this.portfolios.manager.query(
      `SELECT COUNT(*)::text AS total FROM auth.cash_transactions WHERE portfolio_id = $1`,
      [portfolioId],
    );

    const rows: RawCashTransactionRow[] = await this.portfolios.manager.query(
      `SELECT transaction_id, transaction_type, amount, balance_after, effective_date, related_fill_id, created_at
       FROM auth.cash_transactions
       WHERE portfolio_id = $1
       ORDER BY created_at DESC, transaction_id ASC
       LIMIT $2 OFFSET $3`,
      [portfolioId, query.page_size, (query.page - 1) * query.page_size],
    );

    return {
      data: rows.map((row) => this.toCashTransactionResponse(row)),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(countRows[0].total),
      },
    };
  }

  private async findOwned(
    userId: string,
    portfolioId: string,
  ): Promise<RawPortfolioRow> {
    const rows: RawPortfolioRow[] = await this.portfolios.manager.query(
      `SELECT portfolio_id, name, starting_capital, cash_balance, created_at, deleted_at
       FROM auth.virtual_portfolios
       WHERE portfolio_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [portfolioId, userId],
    );
    if (rows.length === 0) {
      throw new PortfolioNotFoundException();
    }
    return rows[0];
  }

  private toPortfolioResponse(row: RawPortfolioRow): PortfolioResponse {
    return {
      portfolio_id: row.portfolio_id,
      name: row.name,
      currency: 'LKR',
      starting_capital: Number(row.starting_capital),
      cash_balance: Number(row.cash_balance),
      status: row.deleted_at ? 'deleted' : 'active',
      created_at: toIsoTimestamp(row.created_at),
    };
  }

  private toCashTransactionResponse(
    row: RawCashTransactionRow,
  ): CashTransactionResponse {
    return {
      transaction_id: row.transaction_id,
      type: row.transaction_type,
      amount: Number(row.amount),
      balance_after: Number(row.balance_after),
      effective_date: toIsoDate(row.effective_date),
      fill_id: row.related_fill_id,
      created_at: toIsoTimestamp(row.created_at),
    };
  }
}

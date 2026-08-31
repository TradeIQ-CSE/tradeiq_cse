import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaperOrder } from '../entities/paper-order.entity';
import {
  OrderNotFoundException,
  OrderRejectedException,
  OrderRejectionCode,
  PortfolioNotFoundException,
} from '../common/errors/api-exception';
import {
  IdempotencyScope,
  assertValidIdempotencyKey,
  completeIdempotencyKey,
  hashCanonicalRequest,
  reserveIdempotencyKey,
} from '../common/idempotency/idempotency';
import { money, toJsonNumber, toNumericString } from '../common/money/money';
import { allocateFifo, OpenLot, realizedPnl } from '../common/money/fifo';
import { MarketTradingClient } from '../market-trading/market-trading.client';
import { PricedOrder, priceOrder } from './execution';
import { SubmitOrderDto } from './dto/submit-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListFillsQueryDto } from './dto/list-fills-query.dto';
import {
  EstimateResponse,
  FeeResponse,
  FillListItem,
  FillResponse,
  OrderResponse,
} from './orders.types';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number };
}

// Raw row shapes from the hand-written queries below. numeric columns come
// back as strings from the pg driver; timestamptz as Date, date as Date.
interface RawOrderRow {
  order_id: string;
  portfolio_id: string;
  symbol: string;
  side: string;
  quantity: number;
  filled_quantity: number;
  status: string;
  rejection_code: string | null;
  placed_at: Date | string;
}

interface RawFillRow {
  fill_id: string;
  order_id: string;
  symbol: string;
  side: string;
  fill_date: Date | string;
  settlement_date: Date | string;
  quantity: number;
  fill_price: string;
  gross_consideration: string;
  fee_total: string;
  realized_pnl: string | null;
}

interface RawLotRow {
  lot_id: string;
  quantity_original: number;
  quantity_remaining: number;
  cost_original: string;
  cost_remaining: string;
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

// node-postgres returns `date` columns as Date objects at local midnight, so
// format from the local getters: toISOString() applies a UTC conversion that
// moves the calendar day in any zone east of UTC.
function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(PaperOrder)
    private readonly orders: Repository<PaperOrder>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly marketTrading: MarketTradingClient,
  ) {}

  // docs/api/paper-trading-v1.md §6.1 — reserves nothing and writes nothing.
  async estimate(
    userId: string,
    portfolioId: string,
    dto: SubmitOrderDto,
  ): Promise<EstimateResponse> {
    const portfolio = await this.findOwnedPortfolio(
      this.orders.manager,
      userId,
      portfolioId,
    );
    const quote = await this.marketTrading.getQuote(dto.symbol);
    const openQuantity = await this.openQuantity(
      this.orders.manager,
      portfolioId,
      dto.symbol,
    );

    const outcome = priceOrder({
      side: dto.side,
      quantity: dto.quantity,
      quote,
      cashBalance: money(portfolio.cash_balance),
      openQuantity,
    });

    // §9.1 — with no order to attach it to, a rejection is an error envelope
    // here. Submission persists the identical outcome instead (§6.2).
    if (outcome.rejected) throw new OrderRejectedException(outcome.code);

    const priced = outcome.priced;
    return {
      symbol: dto.symbol,
      side: dto.side,
      quantity: dto.quantity,
      price: toJsonNumber(priced.price),
      price_as_of: priced.fillDate,
      settlement_date: priced.settlementDate,
      gross_consideration: toJsonNumber(priced.gross),
      fees: this.toFeeResponses(priced),
      fee_total: toJsonNumber(priced.fees.total),
      cash_effect: toJsonNumber(priced.cashEffect),
    };
  }

  // §6.2 — a well-formed order that fails a domain check is still an auditable
  // created resource: it is persisted with status 'rejected' and returned 201,
  // not raised as an error.
  async submit(
    userId: string,
    portfolioId: string,
    dto: SubmitOrderDto,
    idempotencyKey: string | undefined,
  ): Promise<{ body: OrderResponse; replayed: boolean }> {
    assertValidIdempotencyKey(idempotencyKey);

    // Ownership and the quote are resolved before the transaction opens: a
    // network call must never be made while holding row locks, and §4 requires
    // that a transient dependency failure leave the key reusable, which means
    // it has to fail before the key is reserved.
    await this.findOwnedPortfolio(this.orders.manager, userId, portfolioId);
    const quote = await this.marketTrading.getQuote(dto.symbol);

    const requestHash = hashCanonicalRequest({
      symbol: dto.symbol,
      side: dto.side,
      quantity: dto.quantity,
    });
    const scope: IdempotencyScope = {
      userId,
      method: 'POST',
      route: '/portfolios/:portfolioId/orders',
      idempotencyKey,
    };

    return this.dataSource.transaction(async (manager) => {
      const reservation = await reserveIdempotencyKey(
        manager,
        scope,
        requestHash,
      );
      if (reservation.replayed) {
        return { body: reservation.body as OrderResponse, replayed: true };
      }

      // Re-read under lock. §4: "Portfolio rows and open lots are locked
      // during fill execution. Cash and holdings are rechecked inside the
      // transaction." The row read before the quote may already be stale.
      const portfolio = await this.lockPortfolio(manager, userId, portfolioId);
      const lots =
        dto.side === 'sell'
          ? await this.lockOpenLots(manager, portfolioId, dto.symbol)
          : [];
      const openQuantity = lots.reduce(
        (sum, lot) => sum + lot.quantity_remaining,
        0,
      );

      const outcome = priceOrder({
        side: dto.side,
        quantity: dto.quantity,
        quote,
        cashBalance: money(portfolio.cash_balance),
        openQuantity,
      });

      const orderId = randomUUID();
      const placedAt = new Date();

      const body = outcome.rejected
        ? await this.writeRejectedOrder(
            manager,
            orderId,
            portfolioId,
            dto,
            outcome.code,
            placedAt,
          )
        : await this.writeFilledOrder(
            manager,
            orderId,
            portfolioId,
            dto,
            outcome.priced,
            lots,
            money(portfolio.cash_balance),
            placedAt,
          );

      await completeIdempotencyKey(
        manager,
        reservation.recordId,
        HttpStatus.CREATED,
        body,
        orderId,
      );

      return { body, replayed: false };
    });
  }

  private async writeRejectedOrder(
    manager: EntityManager,
    orderId: string,
    portfolioId: string,
    dto: SubmitOrderDto,
    code: OrderRejectionCode,
    placedAt: Date,
  ): Promise<OrderResponse> {
    // No fill, no fees, no cash and no lot movement — only the order itself,
    // so the user has an auditable record of what was refused and why (§8.4).
    await manager.query(
      `INSERT INTO auth.paper_orders
         (order_id, portfolio_id, symbol, side, order_type, quantity,
          filled_quantity, status, rejection_code, placed_at, updated_at)
       VALUES ($1, $2, $3, $4, 'market', $5, 0, 'rejected', $6, $7, $7)`,
      [
        orderId,
        portfolioId,
        dto.symbol,
        dto.side,
        dto.quantity,
        code,
        placedAt,
      ],
    );

    return {
      order_id: orderId,
      portfolio_id: portfolioId,
      symbol: dto.symbol,
      side: dto.side,
      order_type: 'market',
      quantity: dto.quantity,
      filled_quantity: 0,
      status: 'rejected',
      rejection_code: code,
      placed_at: placedAt.toISOString(),
      fill: null,
    };
  }

  private async writeFilledOrder(
    manager: EntityManager,
    orderId: string,
    portfolioId: string,
    dto: SubmitOrderDto,
    priced: PricedOrder,
    lots: RawLotRow[],
    cashBefore: ReturnType<typeof money>,
    placedAt: Date,
  ): Promise<OrderResponse> {
    const fillId = randomUUID();

    await manager.query(
      `INSERT INTO auth.paper_orders
         (order_id, portfolio_id, symbol, side, order_type, quantity,
          filled_quantity, status, placed_at, updated_at)
       VALUES ($1, $2, $3, $4, 'market', $5, $5, 'filled', $6, $6)`,
      [orderId, portfolioId, dto.symbol, dto.side, dto.quantity, placedAt],
    );

    // Sells consume lots FIFO; realized P/L is net proceeds less the cost
    // allocated off those lots (§3.3). Buys realize nothing.
    const allocations =
      dto.side === 'sell'
        ? allocateFifo(
            lots.map((lot) => this.toOpenLot(lot)),
            dto.quantity,
          )
        : [];
    const realized =
      dto.side === 'sell' ? realizedPnl(priced.cashEffect, allocations) : null;

    await manager.query(
      `INSERT INTO auth.fills
         (fill_id, order_id, portfolio_id, symbol, fill_date, settlement_date,
          quantity, fill_price, gross_consideration, fee_total, realized_pnl, created_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12)`,
      [
        fillId,
        orderId,
        portfolioId,
        dto.symbol,
        priced.fillDate,
        priced.settlementDate,
        dto.quantity,
        toNumericString(priced.price),
        toNumericString(priced.gross),
        toNumericString(priced.fees.total),
        realized === null ? null : toNumericString(realized),
        placedAt,
      ],
    );

    // One row per component, so the schedule applied stays auditable (§3.2).
    for (const component of priced.fees.components) {
      await manager.query(
        `INSERT INTO auth.fill_fees (fill_fee_id, fill_id, fee_type, rate_percent, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          fillId,
          component.type,
          component.rate_percent.toFixed(5),
          toNumericString(component.amount),
        ],
      );
    }

    // Exactly one net cash row per fill. Component fees are never duplicated
    // as separate cash transactions (§5.5).
    const cashAfter = cashBefore.plus(priced.cashEffect);
    await manager.query(
      `INSERT INTO auth.cash_transactions
         (transaction_id, portfolio_id, transaction_type, amount, related_fill_id,
          effective_date, balance_after, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)`,
      [
        randomUUID(),
        portfolioId,
        dto.side === 'buy' ? 'buy_debit' : 'sell_credit',
        toNumericString(priced.cashEffect),
        fillId,
        priced.fillDate,
        toNumericString(cashAfter),
        placedAt,
      ],
    );

    await manager.query(
      `UPDATE auth.virtual_portfolios SET cash_balance = $2 WHERE portfolio_id = $1`,
      [portfolioId, toNumericString(cashAfter)],
    );

    if (dto.side === 'buy') {
      // §3.3 — a filled buy creates one lot whose original cost is the gross
      // plus all buy fees, which is exactly the cash debited.
      const lotCost = toNumericString(priced.cashEffect.negated());
      await manager.query(
        `INSERT INTO auth.position_lots
           (lot_id, portfolio_id, symbol, buy_fill_id, quantity_original,
            quantity_remaining, cost_original, cost_remaining,
            acquired_date, settlement_date, created_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7::date, $8::date, $9)`,
        [
          randomUUID(),
          portfolioId,
          dto.symbol,
          fillId,
          dto.quantity,
          lotCost,
          priced.fillDate,
          priced.settlementDate,
          placedAt,
        ],
      );
    } else {
      for (const allocation of allocations) {
        await manager.query(
          `UPDATE auth.position_lots
             SET quantity_remaining = quantity_remaining - $2,
                 cost_remaining = cost_remaining - $3
           WHERE lot_id = $1`,
          [
            allocation.lotId,
            allocation.quantity,
            toNumericString(allocation.allocatedCost),
          ],
        );
        await manager.query(
          `INSERT INTO auth.lot_disposals
             (disposal_id, sell_fill_id, lot_id, quantity, allocated_cost, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            fillId,
            allocation.lotId,
            allocation.quantity,
            toNumericString(allocation.allocatedCost),
            placedAt,
          ],
        );
      }
    }

    return {
      order_id: orderId,
      portfolio_id: portfolioId,
      symbol: dto.symbol,
      side: dto.side,
      order_type: 'market',
      quantity: dto.quantity,
      filled_quantity: dto.quantity,
      status: 'filled',
      rejection_code: null,
      placed_at: placedAt.toISOString(),
      fill: {
        fill_id: fillId,
        fill_date: priced.fillDate,
        settlement_date: priced.settlementDate,
        quantity: dto.quantity,
        price: toJsonNumber(priced.price),
        gross_consideration: toJsonNumber(priced.gross),
        fee_total: toJsonNumber(priced.fees.total),
        cash_effect: toJsonNumber(priced.cashEffect),
        realized_pnl: realized === null ? null : toJsonNumber(realized),
      },
    };
  }

  // §6.3 — ordered placed_at DESC, then order_id ASC.
  async list(
    userId: string,
    portfolioId: string,
    query: ListOrdersQueryDto,
  ): Promise<PaginatedResult<OrderResponse>> {
    await this.findOwnedPortfolio(this.orders.manager, userId, portfolioId);

    const filters = [portfolioId];
    let statusClause = '';
    if (query.status !== undefined) {
      filters.push(query.status);
      statusClause = ' AND status = $2';
    }

    const countRows: { total: string }[] = await this.orders.manager.query(
      `SELECT COUNT(*)::text AS total FROM auth.paper_orders
       WHERE portfolio_id = $1${statusClause}`,
      filters,
    );

    const rows: RawOrderRow[] = await this.orders.manager.query(
      `SELECT order_id, portfolio_id, symbol, side, quantity, filled_quantity,
              status, rejection_code, placed_at
         FROM auth.paper_orders
        WHERE portfolio_id = $1${statusClause}
        ORDER BY placed_at DESC, order_id ASC
        LIMIT $${filters.length + 1} OFFSET $${filters.length + 2}`,
      [...filters, query.page_size, (query.page - 1) * query.page_size],
    );

    return {
      data: rows.map((row) => this.toOrderResponse(row)),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(countRows[0].total),
      },
    };
  }

  // §6.4 — a missing order, one in another portfolio, or one owned by another
  // user all return the same ORDER_NOT_FOUND envelope.
  async get(
    userId: string,
    portfolioId: string,
    orderId: string,
  ): Promise<OrderResponse> {
    await this.findOwnedPortfolio(this.orders.manager, userId, portfolioId);

    const rows: RawOrderRow[] = await this.orders.manager.query(
      `SELECT order_id, portfolio_id, symbol, side, quantity, filled_quantity,
              status, rejection_code, placed_at
         FROM auth.paper_orders
        WHERE order_id = $1 AND portfolio_id = $2`,
      [orderId, portfolioId],
    );
    if (rows.length === 0) throw new OrderNotFoundException();

    const order = this.toOrderResponse(rows[0]);

    const fills: RawFillRow[] = await this.orders.manager.query(
      `SELECT f.fill_id, f.order_id, f.symbol, o.side, f.fill_date, f.settlement_date,
              f.quantity, f.fill_price, f.gross_consideration, f.fee_total, f.realized_pnl
         FROM auth.fills f
         JOIN auth.paper_orders o ON o.order_id = f.order_id
        WHERE f.order_id = $1`,
      [orderId],
    );
    order.fill = fills.length > 0 ? this.toFillResponse(fills[0]) : null;
    return order;
  }

  // §6.5 — ordered created_at DESC, then fill_id ASC.
  async listFills(
    userId: string,
    portfolioId: string,
    query: ListFillsQueryDto,
  ): Promise<PaginatedResult<FillListItem>> {
    await this.findOwnedPortfolio(this.orders.manager, userId, portfolioId);

    const countRows: { total: string }[] = await this.orders.manager.query(
      `SELECT COUNT(*)::text AS total FROM auth.fills WHERE portfolio_id = $1`,
      [portfolioId],
    );

    const rows: RawFillRow[] = await this.orders.manager.query(
      `SELECT f.fill_id, f.order_id, f.symbol, o.side, f.fill_date, f.settlement_date,
              f.quantity, f.fill_price, f.gross_consideration, f.fee_total, f.realized_pnl
         FROM auth.fills f
         JOIN auth.paper_orders o ON o.order_id = f.order_id
        WHERE f.portfolio_id = $1
        ORDER BY f.created_at DESC, f.fill_id ASC
        LIMIT $2 OFFSET $3`,
      [portfolioId, query.page_size, (query.page - 1) * query.page_size],
    );

    // One query for every fee row on the page, not one per fill: page_size
    // reaches 200, and the per-fill version made 201 sequential round trips.
    const feeRows: {
      fill_id: string;
      fee_type: string;
      rate_percent: string;
      amount: string;
    }[] =
      rows.length === 0
        ? []
        : await this.orders.manager.query(
            `SELECT fill_id, fee_type, rate_percent, amount FROM auth.fill_fees
              WHERE fill_id = ANY($1::uuid[])
              ORDER BY fill_id ASC, fee_type ASC`,
            [rows.map((row) => row.fill_id)],
          );

    const feesByFill = new Map<string, FeeResponse[]>();
    for (const fee of feeRows) {
      const list = feesByFill.get(fee.fill_id) ?? [];
      list.push({
        type: fee.fee_type,
        rate_percent: Number(fee.rate_percent),
        amount: Number(fee.amount),
      });
      feesByFill.set(fee.fill_id, list);
    }

    const data: FillListItem[] = rows.map((row) => ({
      ...this.toFillResponse(row),
      order_id: row.order_id,
      symbol: row.symbol,
      side: row.side as 'buy' | 'sell',
      fees: feesByFill.get(row.fill_id) ?? [],
    }));

    return {
      data,
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(countRows[0].total),
      },
    };
  }

  // Missing, deleted and other-user portfolios all resolve to the same 404,
  // so an identifier cannot be probed for existence (§5.3).
  private async findOwnedPortfolio(
    manager: EntityManager,
    userId: string,
    portfolioId: string,
  ): Promise<{ cash_balance: string }> {
    const rows: { cash_balance: string }[] = await manager.query(
      `SELECT cash_balance FROM auth.virtual_portfolios
        WHERE portfolio_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [portfolioId, userId],
    );
    if (rows.length === 0) throw new PortfolioNotFoundException();
    return rows[0];
  }

  private async lockPortfolio(
    manager: EntityManager,
    userId: string,
    portfolioId: string,
  ): Promise<{ cash_balance: string }> {
    const rows: { cash_balance: string }[] = await manager.query(
      `SELECT cash_balance FROM auth.virtual_portfolios
        WHERE portfolio_id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [portfolioId, userId],
    );
    if (rows.length === 0) throw new PortfolioNotFoundException();
    return rows[0];
  }

  // Locked in the same order they are consumed, so concurrent sells on one
  // portfolio queue rather than interleave (§4). The ORDER BY matches
  // idx_lots_fifo and the three-key FIFO rule in §3.3.
  private async lockOpenLots(
    manager: EntityManager,
    portfolioId: string,
    symbol: string,
  ): Promise<RawLotRow[]> {
    return manager.query(
      `SELECT lot_id, quantity_original, quantity_remaining, cost_original, cost_remaining
         FROM auth.position_lots
        WHERE portfolio_id = $1 AND symbol = $2 AND quantity_remaining > 0
        ORDER BY acquired_date ASC, created_at ASC, lot_id ASC
        FOR UPDATE`,
      [portfolioId, symbol],
    );
  }

  private async openQuantity(
    manager: EntityManager,
    portfolioId: string,
    symbol: string,
  ): Promise<number> {
    const rows: { open_quantity: string }[] = await manager.query(
      `SELECT COALESCE(SUM(quantity_remaining), 0)::text AS open_quantity
         FROM auth.position_lots
        WHERE portfolio_id = $1 AND symbol = $2 AND quantity_remaining > 0`,
      [portfolioId, symbol],
    );
    return Number(rows[0].open_quantity);
  }

  private toOpenLot(row: RawLotRow): OpenLot {
    return {
      lotId: row.lot_id,
      quantityOriginal: row.quantity_original,
      quantityRemaining: row.quantity_remaining,
      costOriginal: money(row.cost_original),
      costRemaining: money(row.cost_remaining),
    };
  }

  private toFeeResponses(priced: PricedOrder): FeeResponse[] {
    return priced.fees.components.map((component) => ({
      type: component.type,
      rate_percent: component.rate_percent,
      amount: toJsonNumber(component.amount),
    }));
  }

  private toOrderResponse(row: RawOrderRow): OrderResponse {
    return {
      order_id: row.order_id,
      portfolio_id: row.portfolio_id,
      symbol: row.symbol,
      side: row.side as 'buy' | 'sell',
      order_type: 'market',
      quantity: row.quantity,
      filled_quantity: row.filled_quantity,
      status: row.status as 'filled' | 'rejected',
      rejection_code: row.rejection_code,
      placed_at: toIsoTimestamp(row.placed_at),
    };
  }

  private toFillResponse(row: RawFillRow): FillResponse {
    const gross = Number(row.gross_consideration);
    const feeTotal = Number(row.fee_total);
    return {
      fill_id: row.fill_id,
      fill_date: toIsoDate(row.fill_date),
      settlement_date: toIsoDate(row.settlement_date),
      quantity: row.quantity,
      price: Number(row.fill_price),
      gross_consideration: gross,
      fee_total: feeTotal,
      // Reconstructed rather than stored: the signed movement is the net cash
      // row, and re-deriving it keeps the response consistent with the ledger.
      cash_effect: toJsonNumber(
        row.side === 'buy'
          ? money(gross).plus(feeTotal).negated()
          : money(gross).minus(feeTotal),
      ),
      realized_pnl: row.realized_pnl === null ? null : Number(row.realized_pnl),
    };
  }
}

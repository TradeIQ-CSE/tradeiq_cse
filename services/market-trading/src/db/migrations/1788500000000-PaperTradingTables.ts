import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TIQ-128 — paper trading moves from identity-auth to market-trading, so the
 * fill, fee and valuation rules live in the same service as the backtesting
 * engine and the price data both of them read.
 *
 * These tables are created in their final shape rather than replaying
 * identity-auth's three migrations: this database has never held them, so
 * there is no history to reproduce. The shape is the one that service reached
 * after 1786358400000-InitialSchema, 1788001100000-AddIdempotencyRecords and
 * 1788150000000-AddPaperOrderExecution.
 *
 * The one deliberate difference is `user_id`. In `auth` it was a foreign key to
 * `auth.users`; `market_data` is a separate database with its own role, so the
 * reference cannot be enforced here. It is a plain uuid, exactly as
 * `market_data.backtest_runs.owner_id` already is. Deleting a user therefore no
 * longer cascades, which is a behaviour change to handle explicitly rather than
 * one to leave to the database.
 */
export class PaperTradingTables1788500000000 implements MigrationInterface {
  name = 'PaperTradingTables1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rule sets come along because virtual_portfolios and paper_orders both
    // reference them, and a rule set describes a trading strategy — the same
    // subject as the backtesting rules DSL (ADR 0002). No application code
    // reads or writes them yet.
    await queryRunner.query(`
      CREATE TABLE market_data.rule_sets (
          rule_set_id       uuid PRIMARY KEY,
          user_id           uuid NOT NULL,
          name              varchar(100) NOT NULL,
          buy_rule          jsonb NOT NULL,
          sell_rules        jsonb NOT NULL,
          is_public         boolean NOT NULL DEFAULT false,
          created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_rule_sets_user ON market_data.rule_sets(user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE market_data.virtual_portfolios (
          portfolio_id        uuid PRIMARY KEY,
          user_id             uuid NOT NULL,
          name                varchar(100) NOT NULL,
          starting_capital    numeric(18,4) NOT NULL,
          cash_balance        numeric(18,4) NOT NULL,
          attached_rule_set_id uuid REFERENCES market_data.rule_sets(rule_set_id),
          created_at          timestamptz NOT NULL DEFAULT now(),
          deleted_at          timestamptz,
          CONSTRAINT portfolio_capital_chk CHECK (starting_capital BETWEEN 100000 AND 100000000)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_portfolios_user ON market_data.virtual_portfolios(user_id) WHERE deleted_at IS NULL`,
    );

    // docs/api/paper-trading-v1.md §10.1, §10.3 — canonical symbol, and a
    // stable rejection code whose display text is mapped in application code.
    await queryRunner.query(`
      CREATE TABLE market_data.paper_orders (
          order_id          uuid PRIMARY KEY,
          portfolio_id      uuid NOT NULL REFERENCES market_data.virtual_portfolios(portfolio_id),
          symbol            varchar(20) NOT NULL,
          side              varchar(4)  NOT NULL,
          order_type        varchar(10) NOT NULL,
          quantity          int NOT NULL,
          filled_quantity   int NOT NULL DEFAULT 0,
          limit_price       numeric(12,4),
          validity          varchar(4) NOT NULL DEFAULT 'gtc',
          status            varchar(20) NOT NULL DEFAULT 'accepted',
          rejection_code    varchar(40),
          rule_set_id       uuid REFERENCES market_data.rule_sets(rule_set_id),
          placed_at         timestamptz NOT NULL DEFAULT now(),
          updated_at        timestamptz NOT NULL DEFAULT now(),
          expires_at        timestamptz,
          CONSTRAINT orders_side_chk     CHECK (side IN ('buy','sell')),
          CONSTRAINT orders_type_chk     CHECK (order_type IN ('market','limit')),
          CONSTRAINT orders_validity_chk CHECK (validity IN ('day','gtc')),
          CONSTRAINT orders_status_chk   CHECK (status IN ('accepted','partially_filled','filled','cancelled','expired','rejected')),
          CONSTRAINT orders_qty_chk      CHECK (quantity > 0 AND filled_quantity BETWEEN 0 AND quantity),
          CONSTRAINT orders_limit_chk    CHECK ((order_type='limit' AND limit_price IS NOT NULL)
                                             OR (order_type='market' AND limit_price IS NULL)),
          CONSTRAINT orders_rejection_code_chk CHECK (
            rejection_code IS NULL OR rejection_code IN (
              'INSUFFICIENT_CASH','INSUFFICIENT_HOLDINGS','TRANSACTION_LIMIT_EXCEEDED',
              'SECURITY_NOT_FOUND','SECURITY_NOT_TRADABLE','PRICE_UNAVAILABLE','STALE_PRICE'
            )
          ),
          CONSTRAINT orders_rejection_state_chk CHECK (
            (status = 'rejected' AND rejection_code IS NOT NULL)
            OR (status <> 'rejected' AND rejection_code IS NULL)
          )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_orders_open ON market_data.paper_orders(portfolio_id, status)
         WHERE status IN ('accepted','partially_filled')`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_portfolio_placed ON market_data.paper_orders(portfolio_id, placed_at DESC, order_id)`,
    );

    // fills_order_uq is load-bearing, not documentation: v1 has no partial
    // fills, so one fill per order is what makes a retried execution
    // impossible to double-write even if the idempotency check were bypassed.
    await queryRunner.query(`
      CREATE TABLE market_data.fills (
          fill_id             uuid PRIMARY KEY,
          order_id            uuid NOT NULL REFERENCES market_data.paper_orders(order_id),
          portfolio_id        uuid NOT NULL REFERENCES market_data.virtual_portfolios(portfolio_id),
          symbol              varchar(20) NOT NULL,
          fill_date           date NOT NULL,
          settlement_date     date NOT NULL,
          quantity            int NOT NULL CHECK (quantity > 0),
          fill_price          numeric(12,4) NOT NULL,
          gross_consideration numeric(18,4) NOT NULL,
          fee_total           numeric(18,4) NOT NULL,
          realized_pnl        numeric(18,4),
          created_at          timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT fills_order_uq UNIQUE (order_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_fills_portfolio_date ON market_data.fills(portfolio_id, fill_date DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE market_data.fill_fees (
          fill_fee_id       uuid PRIMARY KEY,
          fill_id           uuid NOT NULL REFERENCES market_data.fills(fill_id) ON DELETE CASCADE,
          fee_type          varchar(20) NOT NULL,
          rate_percent      numeric(8,5) NOT NULL,
          amount            numeric(18,4) NOT NULL,
          CONSTRAINT fill_fees_type_chk CHECK (fee_type IN ('brokerage','cse','cds','sec_cess','stl')),
          CONSTRAINT fill_fees_uq UNIQUE (fill_id, fee_type)
      )
    `);

    // §10.5 — original and remaining lot cost at 4 decimal places, so the
    // allocation that closes a lot can take its exact remainder rather than a
    // proportional share.
    await queryRunner.query(`
      CREATE TABLE market_data.position_lots (
          lot_id                uuid PRIMARY KEY,
          portfolio_id          uuid NOT NULL REFERENCES market_data.virtual_portfolios(portfolio_id),
          symbol                varchar(20) NOT NULL,
          buy_fill_id           uuid NOT NULL REFERENCES market_data.fills(fill_id),
          quantity_original     int NOT NULL CHECK (quantity_original > 0),
          quantity_remaining    int NOT NULL CHECK (quantity_remaining >= 0),
          cost_original         numeric(18,4) NOT NULL,
          cost_remaining        numeric(18,4) NOT NULL,
          acquired_date         date NOT NULL,
          settlement_date       date NOT NULL,
          created_at            timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT lots_qty_chk  CHECK (quantity_remaining <= quantity_original),
          CONSTRAINT lots_cost_chk CHECK (
            cost_original >= 0 AND cost_remaining BETWEEN 0 AND cost_original
          )
      )
    `);
    // Matches the ORDER BY the sell path uses, so one order drives both the
    // scan and the FOR UPDATE lock (§3.3 FIFO tie-breaks).
    await queryRunner.query(
      `CREATE INDEX idx_lots_fifo ON market_data.position_lots
         (portfolio_id, symbol, acquired_date, created_at, lot_id)
         WHERE quantity_remaining > 0`,
    );

    // §10.4 — every sell-to-lot allocation is persisted, so FIFO consumption
    // and realized P/L can be audited after the fact.
    await queryRunner.query(`
      CREATE TABLE market_data.lot_disposals (
          disposal_id     uuid PRIMARY KEY,
          sell_fill_id    uuid NOT NULL REFERENCES market_data.fills(fill_id),
          lot_id          uuid NOT NULL REFERENCES market_data.position_lots(lot_id),
          quantity        int  NOT NULL CHECK (quantity > 0),
          allocated_cost  numeric(18,4) NOT NULL CHECK (allocated_cost >= 0),
          created_at      timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT lot_disposals_uq UNIQUE (sell_fill_id, lot_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_lot_disposals_fill ON market_data.lot_disposals(sell_fill_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE market_data.cash_transactions (
          transaction_id    uuid PRIMARY KEY,
          portfolio_id      uuid NOT NULL REFERENCES market_data.virtual_portfolios(portfolio_id),
          transaction_type  varchar(20) NOT NULL,
          amount            numeric(18,4) NOT NULL,
          related_fill_id   uuid REFERENCES market_data.fills(fill_id),
          effective_date    date NOT NULL,
          balance_after     numeric(18,4) NOT NULL,
          created_at        timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT cash_txn_type_chk CHECK (transaction_type IN
              ('initial_capital','buy_debit','sell_credit','fee_debit','reset'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_cash_txn_portfolio ON market_data.cash_transactions(portfolio_id, effective_date DESC)`,
    );
    // §10.6 — a fill produces exactly one net cash row (§5.5), and a portfolio
    // opens exactly once.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_cash_txn_fill ON market_data.cash_transactions(related_fill_id)
         WHERE related_fill_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_cash_txn_initial ON market_data.cash_transactions(portfolio_id)
         WHERE transaction_type = 'initial_capital'`,
    );

    // §4, §10.2 — the UNIQUE constraint is load-bearing: the reserve-then-fill
    // check uses INSERT ... ON CONFLICT DO NOTHING against it to stay race-safe
    // under concurrent retries.
    await queryRunner.query(`
      CREATE TABLE market_data.idempotency_records (
          idempotency_record_id  uuid PRIMARY KEY,
          user_id                uuid NOT NULL,
          method                 varchar(10)  NOT NULL,
          route                  varchar(200) NOT NULL,
          idempotency_key        varchar(128) NOT NULL,
          request_hash           varchar(64)  NOT NULL,
          response_status        int,
          response_body          jsonb,
          created_resource_id    uuid,
          created_at             timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT idempotency_key_len_chk CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
          CONSTRAINT idempotency_scope_uq UNIQUE (user_id, method, route, idempotency_key)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS market_data.idempotency_records`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS market_data.cash_transactions`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.lot_disposals`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.position_lots`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.fill_fees`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.fills`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.paper_orders`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS market_data.virtual_portfolios`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.rule_sets`);
  }
}

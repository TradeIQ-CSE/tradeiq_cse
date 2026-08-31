import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0003_add_paper_order_execution — TIQ-59
 * (docs/api/paper-trading-v1.md §10.1, §10.3–§10.6).
 * Forward migration on top of 1786358400000-InitialSchema; shipped migrations
 * are never edited.
 *
 * paper_orders, fills, fill_fees and position_lots exist from InitialSchema but
 * no application code has ever written to them, so dropping columns and adding
 * NOT NULL ones needs no backfill.
 *
 * The identifier change is the important one: these tables stored a
 * market-trading `security_id` uuid, which identity-auth is not allowed to
 * resolve — the market API exposes symbols only (§1). Canonical symbols cross
 * the service boundary; database uuids do not.
 */
export class AddPaperOrderExecution1788150000000 implements MigrationInterface {
  name = 'AddPaperOrderExecution1788150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // §10.1 — canonical symbol replaces the cross-service uuid.
    // §10.3 — a stable rejection code; display text is mapped in application
    // code, so the free-text column goes.
    await queryRunner.query(`
      ALTER TABLE auth.paper_orders
        DROP COLUMN security_id,
        DROP COLUMN rejection_reason,
        ADD COLUMN symbol         varchar(20) NOT NULL,
        ADD COLUMN rejection_code varchar(40),
        ADD CONSTRAINT orders_rejection_code_chk CHECK (
          rejection_code IS NULL OR rejection_code IN (
            'INSUFFICIENT_CASH','INSUFFICIENT_HOLDINGS','TRANSACTION_LIMIT_EXCEEDED',
            'SECURITY_NOT_FOUND','SECURITY_NOT_TRADABLE','PRICE_UNAVAILABLE','STALE_PRICE'
          )
        ),
        ADD CONSTRAINT orders_rejection_state_chk CHECK (
          (status = 'rejected' AND rejection_code IS NOT NULL)
          OR (status <> 'rejected' AND rejection_code IS NULL)
        )
    `);

    // gross_consideration is stored rather than recomputed: it is an input to
    // every fee row and to realized P/L, and §3.2 fixes it as a rounded result
    // (R4(quantity x fill_price)) rather than something to derive on read.
    //
    // fills_order_uq is load-bearing, not documentation. V1 has no partial
    // fills, so one fill per order is what makes a retried execution
    // impossible to double-write even if the idempotency check were bypassed.
    await queryRunner.query(`
      ALTER TABLE auth.fills
        DROP COLUMN security_id,
        ADD COLUMN symbol              varchar(20) NOT NULL,
        ADD COLUMN gross_consideration numeric(18,4) NOT NULL,
        ADD CONSTRAINT fills_order_uq UNIQUE (order_id)
    `);

    // §10.5 — preserve original and remaining lot cost at 4 decimal places so
    // the final allocation that closes a lot can take its exact remainder.
    // cost_per_share cannot express that: the remainder is a cost, not a rate,
    // and keeping a per-share figure alongside invites the two drifting apart.
    //
    // created_at is new because §3.3 breaks FIFO ties on
    // acquired_date, then created_at, then lot_id — the middle key did not exist.
    await queryRunner.query(`
      ALTER TABLE auth.position_lots
        DROP COLUMN security_id,
        DROP COLUMN cost_per_share,
        ADD COLUMN symbol         varchar(20) NOT NULL,
        ADD COLUMN cost_original  numeric(18,4) NOT NULL,
        ADD COLUMN cost_remaining numeric(18,4) NOT NULL,
        ADD COLUMN created_at     timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT lots_cost_chk CHECK (
          cost_original >= 0 AND cost_remaining BETWEEN 0 AND cost_original
        )
    `);

    // §10.4 — every sell-to-lot allocation is persisted, so FIFO consumption
    // and realized P/L can be audited after the fact.
    await queryRunner.query(`
      CREATE TABLE auth.lot_disposals (
          disposal_id     uuid PRIMARY KEY,
          sell_fill_id    uuid NOT NULL REFERENCES auth.fills(fill_id),
          lot_id          uuid NOT NULL REFERENCES auth.position_lots(lot_id),
          quantity        int  NOT NULL CHECK (quantity > 0),
          allocated_cost  numeric(18,4) NOT NULL CHECK (allocated_cost >= 0),
          created_at      timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT lot_disposals_uq UNIQUE (sell_fill_id, lot_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_lot_disposals_fill ON auth.lot_disposals(sell_fill_id)`,
    );

    // §10.6 — uniqueness that prevents duplicate fill and opening-cash rows.
    // A fill produces exactly one net cash transaction (§5.5): component fees
    // stay auditable through fill_fees and are never duplicated as cash rows.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_cash_txn_fill ON auth.cash_transactions(related_fill_id)
         WHERE related_fill_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_cash_txn_initial ON auth.cash_transactions(portfolio_id)
         WHERE transaction_type = 'initial_capital'`,
    );

    // The old idx_lots_fifo keyed on security_id, so dropping that column
    // above already dropped the index with it — Postgres removes any index
    // involving a dropped column. Only the rebuild is needed here.
    //
    // The new key matches the ORDER BY the sell path uses, so the same order
    // drives both the scan and the FOR UPDATE lock.
    await queryRunner.query(
      `CREATE INDEX idx_lots_fifo ON auth.position_lots
         (portfolio_id, symbol, acquired_date, created_at, lot_id)
         WHERE quantity_remaining > 0`,
    );

    await queryRunner.query(
      `CREATE INDEX idx_orders_portfolio_placed ON auth.paper_orders(portfolio_id, placed_at DESC, order_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX auth.idx_orders_portfolio_placed`);

    await queryRunner.query(`DROP INDEX auth.idx_cash_txn_initial`);
    await queryRunner.query(`DROP INDEX auth.idx_cash_txn_fill`);

    await queryRunner.query(`DROP TABLE auth.lot_disposals`);

    await queryRunner.query(`
      ALTER TABLE auth.position_lots
        DROP CONSTRAINT lots_cost_chk,
        DROP COLUMN created_at,
        DROP COLUMN cost_remaining,
        DROP COLUMN cost_original,
        DROP COLUMN symbol,
        ADD COLUMN cost_per_share numeric(12,4) NOT NULL,
        ADD COLUMN security_id    uuid NOT NULL
    `);

    // Dropping `symbol` above took idx_lots_fifo with it, so recreate the
    // original security_id form only once the column exists again.
    await queryRunner.query(
      `CREATE INDEX idx_lots_fifo ON auth.position_lots(portfolio_id, security_id, acquired_date)
         WHERE quantity_remaining > 0`,
    );

    await queryRunner.query(`
      ALTER TABLE auth.fills
        DROP CONSTRAINT fills_order_uq,
        DROP COLUMN gross_consideration,
        DROP COLUMN symbol,
        ADD COLUMN security_id uuid NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE auth.paper_orders
        DROP CONSTRAINT orders_rejection_state_chk,
        DROP CONSTRAINT orders_rejection_code_chk,
        DROP COLUMN rejection_code,
        DROP COLUMN symbol,
        ADD COLUMN rejection_reason text,
        ADD COLUMN security_id      uuid NOT NULL
    `);
  }
}

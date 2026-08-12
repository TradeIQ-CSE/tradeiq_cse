import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0001_initial — auth schema (10 tables).
 * Source: tradeiq_cse_schema_v2.sql (07 Aug 2026),
 * verified 1:1 against ERD v2 (docs/diagrams/fig14-erd-v2.json).
 * Conventions: money numeric(18,4); prices numeric(12,4); ids uuid.
 */
export class InitialSchema1786358400000 implements MigrationInterface {
  name = 'InitialSchema1786358400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS auth`);

    await queryRunner.query(`
      CREATE TABLE auth.users (
          user_id           uuid PRIMARY KEY,
          email_encrypted   text NOT NULL,
          email_hash        varchar(64) NOT NULL UNIQUE,
          password_hash     varchar(255) NOT NULL,
          display_name      varchar(100) NOT NULL,
          role              varchar(20) NOT NULL DEFAULT 'investor',
          language_pref     varchar(2)  NOT NULL DEFAULT 'en',
          email_verified    boolean     NOT NULL DEFAULT false,
          created_at        timestamptz NOT NULL DEFAULT now(),
          updated_at        timestamptz NOT NULL DEFAULT now(),
          deleted_at        timestamptz,
          CONSTRAINT users_role_chk     CHECK (role IN ('investor','admin')),
          CONSTRAINT users_language_chk CHECK (language_pref IN ('en','ta','si'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auth.email_tokens (
          token_id          uuid PRIMARY KEY,
          user_id           uuid NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
          token_hash        varchar(255) NOT NULL UNIQUE,
          purpose           varchar(20) NOT NULL,
          used_at           timestamptz,
          expires_at        timestamptz NOT NULL,
          created_at        timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT email_tokens_purpose_chk CHECK (purpose IN ('verification','password_reset'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auth.watchlists (
          watchlist_id      uuid PRIMARY KEY,
          user_id           uuid NOT NULL UNIQUE REFERENCES auth.users(user_id) ON DELETE CASCADE,
          symbols           jsonb NOT NULL DEFAULT '[]',
          updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auth.rule_sets (
          rule_set_id       uuid PRIMARY KEY,
          user_id           uuid NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
          name              varchar(100) NOT NULL,
          buy_rule          jsonb NOT NULL,
          sell_rules        jsonb NOT NULL,
          is_public         boolean NOT NULL DEFAULT false,
          created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auth.virtual_portfolios (
          portfolio_id        uuid PRIMARY KEY,
          user_id             uuid NOT NULL REFERENCES auth.users(user_id),
          name                varchar(100) NOT NULL,
          starting_capital    numeric(18,4) NOT NULL,
          cash_balance        numeric(18,4) NOT NULL,
          attached_rule_set_id uuid REFERENCES auth.rule_sets(rule_set_id),
          created_at          timestamptz NOT NULL DEFAULT now(),
          deleted_at          timestamptz,
          CONSTRAINT portfolio_capital_chk CHECK (starting_capital BETWEEN 100000 AND 100000000)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_portfolios_user ON auth.virtual_portfolios(user_id) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE auth.paper_orders (
          order_id          uuid PRIMARY KEY,
          portfolio_id      uuid NOT NULL REFERENCES auth.virtual_portfolios(portfolio_id),
          security_id       uuid NOT NULL,
          side              varchar(4)  NOT NULL,
          order_type        varchar(10) NOT NULL,
          quantity          int NOT NULL,
          filled_quantity   int NOT NULL DEFAULT 0,
          limit_price       numeric(12,4),
          validity          varchar(4) NOT NULL DEFAULT 'gtc',
          status            varchar(20) NOT NULL DEFAULT 'accepted',
          rejection_reason  text,
          rule_set_id       uuid REFERENCES auth.rule_sets(rule_set_id),
          placed_at         timestamptz NOT NULL DEFAULT now(),
          updated_at        timestamptz NOT NULL DEFAULT now(),
          expires_at        timestamptz,
          CONSTRAINT orders_side_chk     CHECK (side IN ('buy','sell')),
          CONSTRAINT orders_type_chk     CHECK (order_type IN ('market','limit')),
          CONSTRAINT orders_validity_chk CHECK (validity IN ('day','gtc')),
          CONSTRAINT orders_status_chk   CHECK (status IN ('accepted','partially_filled','filled','cancelled','expired','rejected')),
          CONSTRAINT orders_qty_chk      CHECK (quantity > 0 AND filled_quantity BETWEEN 0 AND quantity),
          CONSTRAINT orders_limit_chk    CHECK ((order_type='limit' AND limit_price IS NOT NULL)
                                             OR (order_type='market' AND limit_price IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_orders_open ON auth.paper_orders(portfolio_id, status)
         WHERE status IN ('accepted','partially_filled')`,
    );

    await queryRunner.query(`
      CREATE TABLE auth.fills (
          fill_id           uuid PRIMARY KEY,
          order_id          uuid NOT NULL REFERENCES auth.paper_orders(order_id),
          portfolio_id      uuid NOT NULL REFERENCES auth.virtual_portfolios(portfolio_id),
          security_id       uuid NOT NULL,
          fill_date         date NOT NULL,
          settlement_date   date NOT NULL,
          quantity          int NOT NULL CHECK (quantity > 0),
          fill_price        numeric(12,4) NOT NULL,
          fee_total         numeric(18,4) NOT NULL,
          realized_pnl      numeric(18,4),
          created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_fills_portfolio_date ON auth.fills(portfolio_id, fill_date DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE auth.fill_fees (
          fill_fee_id       uuid PRIMARY KEY,
          fill_id           uuid NOT NULL REFERENCES auth.fills(fill_id) ON DELETE CASCADE,
          fee_type          varchar(20) NOT NULL,
          rate_percent      numeric(8,5) NOT NULL,
          amount            numeric(18,4) NOT NULL,
          CONSTRAINT fill_fees_type_chk CHECK (fee_type IN ('brokerage','cse','cds','sec_cess','stl')),
          CONSTRAINT fill_fees_uq UNIQUE (fill_id, fee_type)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE auth.position_lots (
          lot_id                uuid PRIMARY KEY,
          portfolio_id          uuid NOT NULL REFERENCES auth.virtual_portfolios(portfolio_id),
          security_id           uuid NOT NULL,
          buy_fill_id           uuid NOT NULL REFERENCES auth.fills(fill_id),
          quantity_original     int NOT NULL CHECK (quantity_original > 0),
          quantity_remaining    int NOT NULL CHECK (quantity_remaining >= 0),
          cost_per_share        numeric(12,4) NOT NULL,
          acquired_date         date NOT NULL,
          settlement_date       date NOT NULL,
          CONSTRAINT lots_qty_chk CHECK (quantity_remaining <= quantity_original)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_lots_fifo ON auth.position_lots(portfolio_id, security_id, acquired_date)
         WHERE quantity_remaining > 0`,
    );

    await queryRunner.query(`
      CREATE TABLE auth.cash_transactions (
          transaction_id    uuid PRIMARY KEY,
          portfolio_id      uuid NOT NULL REFERENCES auth.virtual_portfolios(portfolio_id),
          transaction_type  varchar(20) NOT NULL,
          amount            numeric(18,4) NOT NULL,
          related_fill_id   uuid REFERENCES auth.fills(fill_id),
          effective_date    date NOT NULL,
          balance_after     numeric(18,4) NOT NULL,
          created_at        timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT cash_txn_type_chk CHECK (transaction_type IN
              ('initial_capital','buy_debit','sell_credit','fee_debit','reset'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_cash_txn_portfolio ON auth.cash_transactions(portfolio_id, effective_date DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auth.cash_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.position_lots`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.fill_fees`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.fills`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.paper_orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.virtual_portfolios`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.rule_sets`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.watchlists`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.email_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth.users`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS auth`);
  }
}

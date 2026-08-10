import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0001_initial — market_data schema (15 tables).
 * Source: tradeiq_cse_schema_v2.sql (post-mentor review, 07 Aug 2026),
 * verified 1:1 against ERD v2 (docs/diagrams/fig14-erd-v2.json).
 * Conventions: money numeric(18,4); prices numeric(12,4); ids uuid.
 * NOTE: daily_prices.trade_date FK references trading_calendar — seed/ingestion
 * must upsert calendar rows before price rows.
 */
export class InitialSchema1786358400000 implements MigrationInterface {
  name = 'InitialSchema1786358400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS market_data`);

    await queryRunner.query(`
      CREATE TABLE market_data.sectors (
          sector_id         uuid PRIMARY KEY,
          gics_code         varchar(10) NOT NULL UNIQUE,
          sector_name       varchar(100) NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.securities (
          security_id        uuid PRIMARY KEY,
          symbol             varchar(20) NOT NULL UNIQUE,
          cse_code           varchar(30) UNIQUE,
          company_name       varchar(200) NOT NULL,
          sector_id          uuid REFERENCES market_data.sectors(sector_id),
          shares_outstanding bigint,
          data_from          date,
          data_to            date,
          created_at         timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.trading_calendar (
          trade_date        date PRIMARY KEY,
          is_trading_day    boolean NOT NULL,
          note              varchar(100)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.ingestion_runs (
          run_id              uuid PRIMARY KEY,
          started_at          timestamptz NOT NULL DEFAULT now(),
          completed_at        timestamptz,
          trigger_type        varchar(20) NOT NULL,
          triggered_by_name   varchar(100),
          records_processed   int NOT NULL DEFAULT 0,
          records_accepted    int NOT NULL DEFAULT 0,
          records_quarantined int NOT NULL DEFAULT 0,
          status              varchar(20) NOT NULL,
          CONSTRAINT ingestion_trigger_chk CHECK (trigger_type IN ('scheduled','manual','backfill')),
          CONSTRAINT ingestion_status_chk  CHECK (status IN ('running','succeeded','failed','partial'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.daily_prices (
          security_id       uuid NOT NULL REFERENCES market_data.securities(security_id),
          trade_date        date NOT NULL REFERENCES market_data.trading_calendar(trade_date),
          open              numeric(12,4),
          high              numeric(12,4) NOT NULL,
          low               numeric(12,4) NOT NULL,
          close             numeric(12,4) NOT NULL,
          adjusted_close    numeric(12,4),
          volume            bigint NOT NULL DEFAULT 0,
          ingestion_run_id  uuid NOT NULL REFERENCES market_data.ingestion_runs(run_id),
          PRIMARY KEY (security_id, trade_date),
          CONSTRAINT daily_prices_ohlc_chk CHECK (high >= low AND high >= close AND low <= close
                                              AND (open IS NULL OR (high >= open AND low <= open)))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_daily_prices_date ON market_data.daily_prices(trade_date)`,
    );

    await queryRunner.query(`
      CREATE TABLE market_data.price_aggregates (
          aggregate_id      uuid PRIMARY KEY,
          security_id       uuid NOT NULL REFERENCES market_data.securities(security_id),
          period_type       varchar(10) NOT NULL,
          period_start      date NOT NULL,
          period_end        date NOT NULL,
          open              numeric(12,4),
          high              numeric(12,4) NOT NULL,
          low               numeric(12,4) NOT NULL,
          close             numeric(12,4) NOT NULL,
          volume            bigint NOT NULL,
          CONSTRAINT price_agg_uq UNIQUE (security_id, period_type, period_start),
          CONSTRAINT price_agg_period_chk CHECK (period_type IN ('weekly','monthly'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.indices (
          index_code        varchar(20) PRIMARY KEY,
          index_name        varchar(100) NOT NULL,
          description       text,
          base_date         date
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.index_values (
          index_value_id    uuid PRIMARY KEY,
          index_code        varchar(20) NOT NULL REFERENCES market_data.indices(index_code),
          trade_date        date NOT NULL REFERENCES market_data.trading_calendar(trade_date),
          index_value       numeric(14,4) NOT NULL,
          CONSTRAINT index_values_uq UNIQUE (index_code, trade_date)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.market_ratios (
          ratio_id          uuid PRIMARY KEY,
          security_id       uuid NOT NULL REFERENCES market_data.securities(security_id),
          valid_from        date NOT NULL,
          valid_to          date,
          pe_ratio          numeric(12,4),
          pb_ratio          numeric(12,4),
          CONSTRAINT market_ratios_uq UNIQUE (security_id, valid_from)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.corporate_actions (
          action_id         uuid PRIMARY KEY,
          security_id       uuid NOT NULL REFERENCES market_data.securities(security_id),
          action_type       varchar(20) NOT NULL,
          ex_date           date NOT NULL,
          record_date       date,
          payment_date      date,
          details           jsonb NOT NULL,
          CONSTRAINT corp_actions_type_chk CHECK (action_type IN ('dividend','split','rights','bonus')),
          CONSTRAINT corp_actions_uq UNIQUE (security_id, action_type, ex_date)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.listing_events (
          event_id          uuid PRIMARY KEY,
          security_id       uuid NOT NULL REFERENCES market_data.securities(security_id),
          event_type        varchar(20) NOT NULL,
          event_date        date NOT NULL,
          details           jsonb,
          CONSTRAINT listing_events_type_chk CHECK (event_type IN ('listed','suspended','resumed','delisted'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.quarantined_records (
          record_id         uuid PRIMARY KEY,
          run_id            uuid NOT NULL REFERENCES market_data.ingestion_runs(run_id),
          raw_payload       jsonb NOT NULL,
          failed_checks     text[] NOT NULL,
          created_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.api_keys (
          api_key_id        uuid PRIMARY KEY,
          user_id           uuid NOT NULL,
          owner_email       varchar(320),
          label             varchar(100),
          key_hash          varchar(255) NOT NULL UNIQUE,
          created_at        timestamptz NOT NULL DEFAULT now(),
          last_used_at      timestamptz,
          revoked_at        timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.backtest_runs (
          backtest_id       uuid PRIMARY KEY,
          user_id           uuid NOT NULL,
          rule_set_id       uuid,
          symbols           jsonb NOT NULL,
          start_date        date NOT NULL,
          end_date          date NOT NULL,
          investment_amount numeric(18,4) NOT NULL,
          data_as_of        date NOT NULL,
          status            varchar(20) NOT NULL DEFAULT 'queued',
          requested_at      timestamptz NOT NULL DEFAULT now(),
          completed_at      timestamptz,
          CONSTRAINT backtest_status_chk CHECK (status IN ('queued','running','completed','failed')),
          CONSTRAINT backtest_dates_chk  CHECK (end_date >= start_date)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.backtest_results (
          result_id                uuid PRIMARY KEY,
          backtest_id              uuid NOT NULL REFERENCES market_data.backtest_runs(backtest_id) ON DELETE CASCADE,
          security_id              uuid NOT NULL,
          period_high              numeric(12,4),
          period_low               numeric(12,4),
          entry_price              numeric(12,4),
          exit_price               numeric(12,4),
          rule_fired               varchar(50),
          cumulative_profit        numeric(18,4),
          hindsight_optimal_profit numeric(18,4),
          CONSTRAINT backtest_results_uq UNIQUE (backtest_id, security_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.backtest_results`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.backtest_runs`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.api_keys`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.quarantined_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.listing_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.corporate_actions`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.market_ratios`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.index_values`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.indices`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.price_aggregates`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.daily_prices`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.ingestion_runs`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.trading_calendar`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.securities`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.sectors`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS market_data`);
  }
}

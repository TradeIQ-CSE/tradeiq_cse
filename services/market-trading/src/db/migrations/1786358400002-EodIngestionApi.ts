import { MigrationInterface, QueryRunner } from 'typeorm';

export class EodIngestionApi1786358400002 implements MigrationInterface {
  name = 'EodIngestionApi1786358400002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE market_data.ingestion_runs
        ADD COLUMN batch_id varchar(64),
        ADD COLUMN contract_version varchar(10),
        ADD COLUMN trading_date date,
        ADD COLUMN source_name varchar(100),
        ADD COLUMN captured_at timestamptz,
        ADD COLUMN source_date_method varchar(100),
        ADD COLUMN raw_payload_hash varchar(64),
        ADD COLUMN market_digest varchar(64),
        ADD COLUMN producer_commit varchar(40),
        ADD COLUMN action_run_url text,
        ADD COLUMN validation_summary jsonb,
        ADD COLUMN error_details jsonb
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ingestion_runs_batch_id_uq
        ON market_data.ingestion_runs(batch_id)
        WHERE batch_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX ingestion_runs_latest_eod_idx
        ON market_data.ingestion_runs(trading_date DESC, completed_at DESC)
        WHERE status = 'succeeded' AND batch_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.daily_price_provenance (
        security_id       uuid NOT NULL,
        trade_date        date NOT NULL,
        ingestion_run_id  uuid NOT NULL REFERENCES market_data.ingestion_runs(run_id),
        source_name       varchar(100) NOT NULL,
        raw_payload_hash  varchar(64) NOT NULL,
        validation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        ohlc_repaired     boolean NOT NULL DEFAULT false,
        PRIMARY KEY (security_id, trade_date),
        FOREIGN KEY (security_id, trade_date)
          REFERENCES market_data.daily_prices(security_id, trade_date)
          ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS market_data.daily_price_provenance`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS market_data.ingestion_runs_latest_eod_idx`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS market_data.ingestion_runs_batch_id_uq`,
    );
    await queryRunner.query(`
      ALTER TABLE market_data.ingestion_runs
        DROP COLUMN IF EXISTS error_details,
        DROP COLUMN IF EXISTS validation_summary,
        DROP COLUMN IF EXISTS action_run_url,
        DROP COLUMN IF EXISTS producer_commit,
        DROP COLUMN IF EXISTS market_digest,
        DROP COLUMN IF EXISTS raw_payload_hash,
        DROP COLUMN IF EXISTS source_date_method,
        DROP COLUMN IF EXISTS captured_at,
        DROP COLUMN IF EXISTS source_name,
        DROP COLUMN IF EXISTS trading_date,
        DROP COLUMN IF EXISTS contract_version,
        DROP COLUMN IF EXISTS batch_id
    `);
  }
}

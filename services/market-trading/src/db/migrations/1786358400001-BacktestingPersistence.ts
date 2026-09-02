import { MigrationInterface, QueryRunner } from 'typeorm';

export class BacktestingPersistence1786358400001 implements MigrationInterface {
  name = 'BacktestingPersistence1786358400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop existing placeholder tables
    await queryRunner.query(
      `DROP TABLE IF EXISTS market_data.backtest_results`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.backtest_runs`);

    // 2. Create backtest_runs table matching the persistence model
    await queryRunner.query(`
      CREATE TABLE market_data.backtest_runs (
          id                     uuid PRIMARY KEY,
          owner_id               uuid NOT NULL,
          status                 varchar(20) NOT NULL,
          symbol                 varchar(20) NOT NULL,
          start_date             date NOT NULL,
          end_date               date NOT NULL,
          starting_capital       numeric(18,4) NOT NULL,
          rule_config            jsonb NOT NULL,
          execution_assumptions  jsonb NOT NULL,
          dataset_version        varchar(50),
          failure_code           varchar(50),
          failure_reason         text,
          created_at             timestamptz NOT NULL DEFAULT now(),
          started_at             timestamptz,
          completed_at           timestamptz,
          CONSTRAINT backtest_runs_status_chk CHECK (status IN ('queued', 'running', 'completed', 'failed')),
          CONSTRAINT backtest_runs_dates_chk  CHECK (end_date >= start_date)
      )
    `);

    // Add indexes for quick querying
    await queryRunner.query(
      `CREATE INDEX idx_backtest_runs_owner_id ON market_data.backtest_runs(owner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_backtest_runs_status ON market_data.backtest_runs(status)`,
    );

    // 3. Create backtest_results table
    await queryRunner.query(`
      CREATE TABLE market_data.backtest_results (
          id               uuid PRIMARY KEY,
          backtest_run_id  uuid NOT NULL REFERENCES market_data.backtest_runs(id) ON DELETE CASCADE,
          symbol           varchar(20) NOT NULL,
          summary_metrics  jsonb NOT NULL,
          trade_ledger     jsonb NOT NULL,
          equity_curve     jsonb NOT NULL,
          created_at       timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT backtest_results_run_uq UNIQUE (backtest_run_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS market_data.backtest_results`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.backtest_runs`);
  }
}

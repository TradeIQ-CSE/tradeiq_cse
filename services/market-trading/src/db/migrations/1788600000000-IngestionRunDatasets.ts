import { MigrationInterface, QueryRunner } from 'typeorm';

// Which cse-dataset release an import run loaded (artifact contract v1 §8).
export class IngestionRunDatasets1788600000000 implements MigrationInterface {
  name = 'IngestionRunDatasets1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE market_data.ingestion_runs
        ADD COLUMN dataset_version varchar(20),
        ADD COLUMN dataset_kind varchar(12),
        ADD COLUMN coverage_start date,
        ADD COLUMN coverage_end date,
        ADD COLUMN source_url text,
        ADD CONSTRAINT ingestion_dataset_kind_chk
          CHECK (dataset_kind IN ('full', 'incremental', 'correction'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE market_data.ingestion_runs
        DROP CONSTRAINT IF EXISTS ingestion_dataset_kind_chk,
        DROP COLUMN IF EXISTS source_url,
        DROP COLUMN IF EXISTS coverage_end,
        DROP COLUMN IF EXISTS coverage_start,
        DROP COLUMN IF EXISTS dataset_kind,
        DROP COLUMN IF EXISTS dataset_version
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0002_add_idempotency_records — TIQ-58 (docs/api/paper-trading-v1.md §4, §10.2).
 * Existing migrations are never edited after they ship; this is a forward
 * migration on top of 1786358400000-InitialSchema.
 *
 * The UNIQUE constraint on (user_id, method, route, idempotency_key) is not
 * just documentation: PortfoliosService relies on
 * `INSERT ... ON CONFLICT DO NOTHING` against it to make the reserve-then-fill
 * idempotency check race-safe under concurrent retries.
 */
export class AddIdempotencyRecords1788001100000 implements MigrationInterface {
  name = 'AddIdempotencyRecords1788001100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE auth.idempotency_records (
          idempotency_record_id  uuid PRIMARY KEY,
          user_id                uuid NOT NULL REFERENCES auth.users(user_id),
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
    await queryRunner.query(`DROP TABLE auth.idempotency_records`);
  }
}

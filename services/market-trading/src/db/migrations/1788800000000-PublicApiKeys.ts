import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * docs/api/public-api-v1.md §8, docs/adr/0010-public-developer-api.md — shapes
 * `market_data.api_keys` (created empty by InitialSchema, never populated) for
 * the public developer API's key management:
 *
 * - `owner_email` is dropped. It would be a second plaintext copy of the
 *   email (SRS 3.4.6); `user_id` already identifies the owner.
 * - `key_prefix` is added for the `GET /developer/key` display value (the
 *   key's first 8 characters). Added with a default and the default then
 *   dropped, rather than left nullable, so every row is always well formed —
 *   safe here only because the table has never been written to.
 * - A partial unique index enforces "one active key per user" (ADR 0010) at
 *   the database, so a race between two concurrent creates can never leave a
 *   user with two active keys.
 * - `key_hash` stays UNIQUE; a CHECK pins it to a SHA-256 hex digest shape,
 *   the same convention as the `*_chk` constraints elsewhere in this schema.
 * - `api_key_usage` backs `GET /developer/usage`'s 30-day daily view.
 */
export class PublicApiKeys1788800000000 implements MigrationInterface {
  name = 'PublicApiKeys1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE market_data.api_keys
        DROP COLUMN owner_email,
        ADD COLUMN key_prefix varchar(12) NOT NULL DEFAULT '',
        ADD CONSTRAINT api_keys_key_hash_chk CHECK (key_hash ~ '^[0-9a-f]{64}$')
    `);
    await queryRunner.query(`
      ALTER TABLE market_data.api_keys
        ALTER COLUMN key_prefix DROP DEFAULT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX api_keys_active_user_uq
        ON market_data.api_keys(user_id) WHERE revoked_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE market_data.api_key_usage (
          api_key_id     uuid NOT NULL
                         REFERENCES market_data.api_keys(api_key_id) ON DELETE CASCADE,
          usage_date     date NOT NULL,
          request_count  integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
          PRIMARY KEY (api_key_id, usage_date)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.api_key_usage`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS market_data.api_keys_active_user_uq`,
    );
    await queryRunner.query(`
      ALTER TABLE market_data.api_keys
        DROP CONSTRAINT IF EXISTS api_keys_key_hash_chk,
        DROP COLUMN IF EXISTS key_prefix,
        ADD COLUMN owner_email varchar(320)
    `);
  }
}

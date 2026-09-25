import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * docs/api/watchlist-v1.md — the securities an investor follows, up to ten
 * each (SRS). identity-auth's initial schema reserved `auth.watchlists` as one
 * jsonb array per user, but no code ever used it. The watchlist lives here
 * instead, beside the prices every row shows, for the same reason paper
 * trading moved (TIQ-128, ADR 0009).
 *
 * One row per followed security rather than an array: adding and removing are
 * single-row writes, the primary key rules out duplicates, and the symbol can
 * reference the securities it names. As on orders and fills, the canonical
 * symbol is stored and `user_id` is a plain uuid with no cross-database key.
 */
export class WatchlistItems1788700000000 implements MigrationInterface {
  name = 'WatchlistItems1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE market_data.watchlist_items (
          user_id     uuid NOT NULL,
          symbol      varchar(20) NOT NULL
                      REFERENCES market_data.securities(symbol) ON UPDATE CASCADE,
          added_at    timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, symbol)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_data.watchlist_items`);
  }
}

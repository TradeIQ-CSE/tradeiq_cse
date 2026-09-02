import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0004_add_refresh_tokens — TIQ-75 (docs/api/auth-v1.md §2.2, §3).
 * Forward migration on top of 1786358400000-InitialSchema; shipped migrations
 * are never edited.
 *
 * auth.users already exists from InitialSchema and needs no change — this adds
 * the session side only.
 *
 * Two decisions worth stating here rather than in a comment somewhere else:
 *
 * - Only sha256(token) is stored, never the token, so a disclosure of this
 *   table yields nothing a caller can present. Same reasoning as password_hash.
 * - family_id groups every token descended from one login. Rotation issues a
 *   new row in the same family; presenting a row that already has used_at set
 *   means the credential was copied, and the whole family is revoked (§3).
 */
export class AddRefreshTokens1788400000000 implements MigrationInterface {
  name = 'AddRefreshTokens1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE auth.refresh_tokens (
          token_id     uuid PRIMARY KEY,
          user_id      uuid NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
          token_hash   varchar(64) NOT NULL UNIQUE,
          family_id    uuid NOT NULL,
          issued_at    timestamptz NOT NULL DEFAULT now(),
          expires_at   timestamptz NOT NULL,
          used_at      timestamptz,
          revoked_at   timestamptz,
          CONSTRAINT refresh_tokens_expiry_chk CHECK (expires_at > issued_at)
      )
    `);

    // Revoking a family is the hot path of reuse detection (§3): one statement
    // over every row sharing the family.
    await queryRunner.query(
      `CREATE INDEX idx_refresh_tokens_family ON auth.refresh_tokens(family_id)`,
    );

    // Supports logout-everywhere and expiry sweeps for one user.
    await queryRunner.query(
      `CREATE INDEX idx_refresh_tokens_user ON auth.refresh_tokens(user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auth.refresh_tokens`);
  }
}

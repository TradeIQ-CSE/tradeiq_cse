import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.refresh_tokens (services/identity-auth/src/db/migrations/1788400000000-AddRefreshTokens.ts).
// docs/api/auth-v1.md §2.2, §3. tokenHash is sha256 of the opaque token; the
// token itself is never stored, so nothing here can be replayed against the API.
@Entity({ schema: 'auth', name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryColumn('uuid', { name: 'token_id' })
  tokenId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar', { name: 'token_hash', length: 64 })
  tokenHash!: string;

  // Every token descended from one login shares this. Reuse of a spent token
  // revokes the family, not just the row.
  @Column('uuid', { name: 'family_id' })
  familyId!: string;

  @Column('timestamptz', { name: 'issued_at' })
  issuedAt!: Date;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  // Set when exchanged. A second presentation of a row with this set is the
  // signal that the credential leaked.
  @Column('timestamptz', { name: 'used_at', nullable: true })
  usedAt!: Date | null;

  @Column('timestamptz', { name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;
}

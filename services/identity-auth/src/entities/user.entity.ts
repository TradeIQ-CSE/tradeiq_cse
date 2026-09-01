import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.users (services/identity-auth/src/db/migrations/1786358400000-InitialSchema.ts).
// The table predates any application code; docs/api/auth-v1.md §5 explains why
// the address is stored twice — encrypted to be readable back, hashed to be
// searchable — and neither column ever holds plaintext.
@Entity({ schema: 'auth', name: 'users' })
export class User {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column('text', { name: 'email_encrypted' })
  emailEncrypted!: string;

  @Column('varchar', { name: 'email_hash', length: 64 })
  emailHash!: string;

  @Column('varchar', { name: 'password_hash', length: 255 })
  passwordHash!: string;

  @Column('varchar', { name: 'display_name', length: 100 })
  displayName!: string;

  @Column('varchar', { name: 'role', length: 20 })
  role!: 'investor' | 'admin';

  @Column('varchar', { name: 'language_pref', length: 2 })
  languagePref!: 'en' | 'ta' | 'si';

  @Column('boolean', { name: 'email_verified' })
  emailVerified!: boolean;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}

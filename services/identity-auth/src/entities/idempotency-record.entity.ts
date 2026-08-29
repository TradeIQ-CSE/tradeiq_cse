import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.idempotency_records (services/identity-auth/src/db/migrations/1788001100000-AddIdempotencyRecords.ts)
@Entity({ schema: 'auth', name: 'idempotency_records' })
export class IdempotencyRecord {
  @PrimaryColumn('uuid', { name: 'idempotency_record_id' })
  idempotencyRecordId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar', { name: 'method', length: 10 })
  method!: string;

  @Column('varchar', { name: 'route', length: 200 })
  route!: string;

  @Column('varchar', { name: 'idempotency_key', length: 128 })
  idempotencyKey!: string;

  @Column('varchar', { name: 'request_hash', length: 64 })
  requestHash!: string;

  @Column('int', { name: 'response_status', nullable: true })
  responseStatus!: number | null;

  @Column('jsonb', { name: 'response_body', nullable: true })
  responseBody!: unknown;

  @Column('uuid', { name: 'created_resource_id', nullable: true })
  createdResourceId!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}

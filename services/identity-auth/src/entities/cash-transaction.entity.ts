import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.cash_transactions (services/identity-auth/src/db/migrations/1786358400000-InitialSchema.ts)
@Entity({ schema: 'auth', name: 'cash_transactions' })
export class CashTransaction {
  @PrimaryColumn('uuid', { name: 'transaction_id' })
  transactionId!: string;

  @Column('uuid', { name: 'portfolio_id' })
  portfolioId!: string;

  @Column('varchar', { name: 'transaction_type', length: 20 })
  transactionType!: string;

  @Column('numeric', { name: 'amount', precision: 18, scale: 4 })
  amount!: string;

  @Column('uuid', { name: 'related_fill_id', nullable: true })
  relatedFillId!: string | null;

  @Column('date', { name: 'effective_date' })
  effectiveDate!: string;

  @Column('numeric', { name: 'balance_after', precision: 18, scale: 4 })
  balanceAfter!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}

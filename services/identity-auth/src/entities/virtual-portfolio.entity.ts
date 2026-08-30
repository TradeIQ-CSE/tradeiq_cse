import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.virtual_portfolios (services/identity-auth/src/db/migrations/1786358400000-InitialSchema.ts)
@Entity({ schema: 'auth', name: 'virtual_portfolios' })
export class VirtualPortfolio {
  @PrimaryColumn('uuid', { name: 'portfolio_id' })
  portfolioId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar', { name: 'name', length: 100 })
  name!: string;

  @Column('numeric', { name: 'starting_capital', precision: 18, scale: 4 })
  startingCapital!: string;

  @Column('numeric', { name: 'cash_balance', precision: 18, scale: 4 })
  cashBalance!: string;

  @Column('uuid', { name: 'attached_rule_set_id', nullable: true })
  attachedRuleSetId!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}

import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.paper_orders, as reshaped by
// services/identity-auth/src/db/migrations/1788150000000-AddPaperOrderExecution.ts
@Entity({ schema: 'auth', name: 'paper_orders' })
export class PaperOrder {
  @PrimaryColumn('uuid', { name: 'order_id' })
  orderId!: string;

  @Column('uuid', { name: 'portfolio_id' })
  portfolioId!: string;

  // Canonical CSE symbol. The market-data uuid is deliberately not stored:
  // it is not resolvable through the market API (paper-trading-v1.md §10.1).
  @Column('varchar', { name: 'symbol', length: 20 })
  symbol!: string;

  @Column('varchar', { name: 'side', length: 4 })
  side!: string;

  @Column('varchar', { name: 'order_type', length: 10 })
  orderType!: string;

  @Column('int', { name: 'quantity' })
  quantity!: number;

  @Column('int', { name: 'filled_quantity' })
  filledQuantity!: number;

  @Column('numeric', {
    name: 'limit_price',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  limitPrice!: string | null;

  @Column('varchar', { name: 'validity', length: 4 })
  validity!: string;

  @Column('varchar', { name: 'status', length: 20 })
  status!: string;

  @Column('varchar', { name: 'rejection_code', length: 40, nullable: true })
  rejectionCode!: string | null;

  @Column('uuid', { name: 'rule_set_id', nullable: true })
  ruleSetId!: string | null;

  @Column('timestamptz', { name: 'placed_at' })
  placedAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'expires_at', nullable: true })
  expiresAt!: Date | null;
}

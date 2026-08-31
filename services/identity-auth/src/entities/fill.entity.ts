import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.fills, as reshaped by
// services/identity-auth/src/db/migrations/1788150000000-AddPaperOrderExecution.ts
@Entity({ schema: 'auth', name: 'fills' })
export class Fill {
  @PrimaryColumn('uuid', { name: 'fill_id' })
  fillId!: string;

  // UNIQUE: v1 has no partial fills, so an order fills exactly once.
  @Column('uuid', { name: 'order_id' })
  orderId!: string;

  @Column('uuid', { name: 'portfolio_id' })
  portfolioId!: string;

  @Column('varchar', { name: 'symbol', length: 20 })
  symbol!: string;

  // The market session the order executed at, not the wall-clock date it was
  // placed on (paper-trading-v1.md §2.2).
  @Column('date', { name: 'fill_date' })
  fillDate!: string;

  @Column('date', { name: 'settlement_date' })
  settlementDate!: string;

  @Column('int', { name: 'quantity' })
  quantity!: number;

  @Column('numeric', { name: 'fill_price', precision: 12, scale: 4 })
  fillPrice!: string;

  @Column('numeric', { name: 'gross_consideration', precision: 18, scale: 4 })
  grossConsideration!: string;

  @Column('numeric', { name: 'fee_total', precision: 18, scale: 4 })
  feeTotal!: string;

  // Null on a buy; set only on a sell (§6.2).
  @Column('numeric', {
    name: 'realized_pnl',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  realizedPnl!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}

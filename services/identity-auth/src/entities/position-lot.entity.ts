import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.position_lots, as reshaped by
// services/identity-auth/src/db/migrations/1788150000000-AddPaperOrderExecution.ts
//
// Positions are derived from open lots rather than stored: there is no
// positions table.
@Entity({ schema: 'auth', name: 'position_lots' })
export class PositionLot {
  @PrimaryColumn('uuid', { name: 'lot_id' })
  lotId!: string;

  @Column('uuid', { name: 'portfolio_id' })
  portfolioId!: string;

  @Column('varchar', { name: 'symbol', length: 20 })
  symbol!: string;

  @Column('uuid', { name: 'buy_fill_id' })
  buyFillId!: string;

  @Column('int', { name: 'quantity_original' })
  quantityOriginal!: number;

  @Column('int', { name: 'quantity_remaining' })
  quantityRemaining!: number;

  // Both costs are kept so the allocation that closes a lot can take its exact
  // remainder instead of a proportional share (§3.3). costOriginal is the buy
  // gross plus all buy fees.
  @Column('numeric', { name: 'cost_original', precision: 18, scale: 4 })
  costOriginal!: string;

  @Column('numeric', { name: 'cost_remaining', precision: 18, scale: 4 })
  costRemaining!: string;

  @Column('date', { name: 'acquired_date' })
  acquiredDate!: string;

  @Column('date', { name: 'settlement_date' })
  settlementDate!: string;

  // Second FIFO tie-break key, after acquired_date and before lot_id.
  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}

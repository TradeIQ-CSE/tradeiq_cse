import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.lot_disposals
// (1788150000000-AddPaperOrderExecution.ts, paper-trading-v1.md §10.4).
// One row per sell-to-lot allocation, so FIFO consumption and realized P/L can
// be reconstructed from the ledger.
@Entity({ schema: 'auth', name: 'lot_disposals' })
export class LotDisposal {
  @PrimaryColumn('uuid', { name: 'disposal_id' })
  disposalId!: string;

  @Column('uuid', { name: 'sell_fill_id' })
  sellFillId!: string;

  @Column('uuid', { name: 'lot_id' })
  lotId!: string;

  @Column('int', { name: 'quantity' })
  quantity!: number;

  @Column('numeric', { name: 'allocated_cost', precision: 18, scale: 4 })
  allocatedCost!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}

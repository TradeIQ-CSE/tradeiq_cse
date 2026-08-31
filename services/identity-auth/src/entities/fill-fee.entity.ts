import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps auth.fill_fees (1786358400000-InitialSchema.ts).
// One row per fee component, so the schedule applied to a fill stays auditable
// after the fact (paper-trading-v1.md §3.2).
@Entity({ schema: 'auth', name: 'fill_fees' })
export class FillFee {
  @PrimaryColumn('uuid', { name: 'fill_fee_id' })
  fillFeeId!: string;

  @Column('uuid', { name: 'fill_id' })
  fillId!: string;

  @Column('varchar', { name: 'fee_type', length: 20 })
  feeType!: string;

  // Percent units held to 5 decimal places, e.g. 0.64000 for brokerage.
  @Column('numeric', { name: 'rate_percent', precision: 8, scale: 5 })
  ratePercent!: string;

  @Column('numeric', { name: 'amount', precision: 18, scale: 4 })
  amount!: string;
}

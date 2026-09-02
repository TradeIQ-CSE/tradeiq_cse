import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'daily_prices', schema: 'market_data' })
export class DailyPrice {
  @PrimaryColumn({ name: 'security_id', type: 'uuid' })
  securityId!: string;

  @PrimaryColumn({ name: 'trade_date', type: 'date' })
  tradeDate!: string;

  @Column({
    name: 'open',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  open?: string;

  @Column({ name: 'high', type: 'numeric', precision: 12, scale: 4 })
  high!: string;

  @Column({ name: 'low', type: 'numeric', precision: 12, scale: 4 })
  low!: string;

  @Column({ name: 'close', type: 'numeric', precision: 12, scale: 4 })
  close!: string;

  @Column({
    name: 'adjusted_close',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  adjustedClose?: string;

  @Column({ name: 'volume', type: 'bigint' })
  volume!: string;

  @Column({ name: 'ingestion_run_id', type: 'uuid' })
  ingestionRunId!: string;
}

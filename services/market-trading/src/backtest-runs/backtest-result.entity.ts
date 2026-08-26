import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'backtest_results', schema: 'market_data' })
export class BacktestResult {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'backtest_run_id', type: 'uuid', unique: true })
  backtestRunId!: string;

  @Column({ name: 'symbol', type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ name: 'summary_metrics', type: 'jsonb' })
  summaryMetrics!: any;

  @Column({ name: 'trade_ledger', type: 'jsonb' })
  tradeLedger!: any;

  @Column({ name: 'equity_curve', type: 'jsonb' })
  equityCurve!: any;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}

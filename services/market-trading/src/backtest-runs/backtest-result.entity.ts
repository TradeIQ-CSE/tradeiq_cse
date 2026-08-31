import { Entity, Column, PrimaryColumn } from 'typeorm';
import {
  TradeLedgerEntry,
  EquityCurvePoint,
} from '../backtesting/domain/types';

export interface BacktestSummaryMetrics {
  initialCapital: number;
  finalCash: number;
  finalEquity: number;
  totalReturnPct: number;
}

@Entity({ name: 'backtest_results', schema: 'market_data' })
export class BacktestResult {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'backtest_run_id', type: 'uuid', unique: true })
  backtestRunId!: string;

  @Column({ name: 'symbol', type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ name: 'summary_metrics', type: 'jsonb' })
  summaryMetrics!: BacktestSummaryMetrics;

  @Column({ name: 'trade_ledger', type: 'jsonb' })
  tradeLedger!: TradeLedgerEntry[];

  @Column({ name: 'equity_curve', type: 'jsonb' })
  equityCurve!: EquityCurvePoint[];

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}

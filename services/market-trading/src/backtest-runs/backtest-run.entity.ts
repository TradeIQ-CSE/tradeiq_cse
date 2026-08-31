import { Entity, Column, PrimaryColumn } from 'typeorm';
import {
  FeeConfig,
  PositionSizingConfig,
  RuleSet,
} from '../backtesting/domain/types';

export interface BacktestExecutionAssumptions {
  feeConfig: FeeConfig;
  positionSizing: PositionSizingConfig;
  warmupPeriod: number;
}

@Entity({ name: 'backtest_runs', schema: 'market_data' })
export class BacktestRun {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: 'queued' | 'running' | 'completed' | 'failed';

  @Column({ name: 'symbol', type: 'varchar', length: 20 })
  symbol!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({
    name: 'starting_capital',
    type: 'numeric',
    precision: 18,
    scale: 4,
  })
  startingCapital!: number;

  @Column({ name: 'rule_config', type: 'jsonb' })
  ruleConfig!: RuleSet;

  @Column({ name: 'execution_assumptions', type: 'jsonb' })
  executionAssumptions!: BacktestExecutionAssumptions;

  @Column({
    name: 'dataset_version',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  datasetVersion?: string;

  @Column({ name: 'failure_code', type: 'varchar', length: 50, nullable: true })
  failureCode?: string;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;
}

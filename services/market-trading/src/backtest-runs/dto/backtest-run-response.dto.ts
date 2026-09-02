export interface SubmitBacktestResponseDto {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface BacktestStatusResponseDto {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  symbol: string;
  startDate: string;
  endDate: string;
  startingCapital: number;
  failureCode?: string;
  failureReason?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

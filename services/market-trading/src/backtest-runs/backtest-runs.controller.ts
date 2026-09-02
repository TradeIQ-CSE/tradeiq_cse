import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { BacktestRunsService } from './backtest-runs.service';
import { CreateBacktestRunDto } from './dto/create-backtest-run.dto';

@Controller('api/v1/backtests')
export class BacktestRunsController {
  constructor(private readonly service: BacktestRunsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submitRun(
    @Body() dto: CreateBacktestRunDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    // Default fallback owner UUID if not provided via HTTP headers
    const ownerId = userIdHeader || '00000000-0000-0000-0000-000000000000';
    const run = await this.service.submitRun(dto, ownerId);
    return {
      id: run.id,
      status: 'queued',
    };
  }

  @Get(':runId')
  async getStatus(
    @Param('runId') runId: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const ownerId = userIdHeader || '00000000-0000-0000-0000-000000000000';
    const run = await this.service.getRunStatus(runId, ownerId);
    return {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  @Get(':runId/results')
  async getResults(
    @Param('runId') runId: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const ownerId = userIdHeader || '00000000-0000-0000-0000-000000000000';
    const result = await this.service.getRunResults(runId, ownerId);
    return {
      initialCapital: result.summaryMetrics.initialCapital,
      finalCash: result.summaryMetrics.finalCash,
      finalEquity: result.summaryMetrics.finalEquity,
      trades: result.tradeLedger,
      equityCurve: result.equityCurve,
    };
  }
}

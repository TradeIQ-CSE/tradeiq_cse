import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BacktestRunsService } from './backtest-runs.service';
import { CreateBacktestRunDto } from './dto/create-backtest-run.dto';

// A backtest run belongs to the user who submitted it, so every route here is
// authenticated and the owner comes only from the verified token.
//
// These routes previously read the owner from an `x-user-id` request header,
// falling back to a shared nil UUID. On an unauthenticated service that header
// is whatever the caller types: any client could read any user's runs, and
// everyone who omitted it shared one owner. paper-trading-v1.md §1 names that
// pattern directly — "production code must not trust a client-supplied user
// header as an authentication substitute".
@UseGuards(JwtAuthGuard)
@Controller('api/v1/backtests')
export class BacktestRunsController {
  constructor(private readonly service: BacktestRunsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submitRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBacktestRunDto,
  ) {
    const run = await this.service.submitRun(dto, user.userId);
    return {
      id: run.id,
      status: 'queued',
    };
  }

  @Get(':runId')
  async getStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    const run = await this.service.getRunStatus(runId, user.userId);
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    const result = await this.service.getRunResults(runId, user.userId);
    return {
      initialCapital: result.summaryMetrics.initialCapital,
      finalCash: result.summaryMetrics.finalCash,
      finalEquity: result.summaryMetrics.finalEquity,
      trades: result.tradeLedger,
      equityCurve: result.equityCurve,
    };
  }
}

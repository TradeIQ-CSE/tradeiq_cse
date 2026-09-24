import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { BacktestRunsService } from './backtest-runs.service';
import { CreateBacktestRunDto } from './dto/create-backtest-run.dto';

// The one backtest route that needs no account. It returns results straight
// away and stores nothing, so there is no run for anyone else to read and no
// owner to take from a token. Saving a backtest still goes through the
// authenticated BacktestRunsController.
@Controller('api/v1/backtests/preview')
export class BacktestPreviewController {
  constructor(private readonly service: BacktestRunsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: CreateBacktestRunDto) {
    return this.service.previewRun(dto);
  }
}

import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Public policy, registered before the authenticated :runId route. */
@Controller('api/v1/backtests')
export class BacktestPolicyController {
  constructor(private readonly config: ConfigService) {}

  @Get('policy')
  @Header('Cache-Control', 'no-store')
  getPolicy() {
    return { maxDate: this.config.getOrThrow<string>('backtesting.maxDate') };
  }
}

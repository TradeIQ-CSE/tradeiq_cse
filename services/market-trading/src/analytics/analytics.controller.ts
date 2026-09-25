import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfolioIdParamDto } from '../portfolios/dto/portfolio-id-param.dto';
import { ListBacktestsQueryDto } from './dto/list-backtests-query.dto';
import { AnalyticsService } from './analytics.service';

// docs/api/analytics-v1.md — read-only views over the caller's own backtests
// and portfolios.
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('backtests')
  listBacktests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListBacktestsQueryDto,
  ) {
    return this.analytics.listBacktests(user.userId, query);
  }

  @Get('portfolios/:portfolioId/performance')
  async portfolioPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { portfolioId }: PortfolioIdParamDto,
  ) {
    return {
      data: await this.analytics.portfolioPerformance(user.userId, portfolioId),
    };
  }
}

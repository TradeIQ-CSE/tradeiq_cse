import { Controller, Get, Query } from '@nestjs/common';
import { MarketOverviewQueryDto } from './dto/market-overview-query.dto';
import { MarketOverviewService } from './market-overview.service';

// docs/api/endpoint-catalogue-v0.md §6 — GET /market/overview
@Controller('market')
export class MarketOverviewController {
  constructor(private readonly marketOverview: MarketOverviewService) {}

  @Get('overview')
  overview(@Query() query: MarketOverviewQueryDto) {
    return this.marketOverview.getOverview(query);
  }
}

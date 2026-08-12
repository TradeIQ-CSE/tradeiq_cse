import { Controller, Get, Query } from '@nestjs/common';
import { ListSecuritiesQueryDto } from './dto/list-securities-query.dto';
import { SecuritiesService } from './securities.service';

// docs/api/endpoint-catalogue-v0.md §3 — GET /securities
@Controller('securities')
export class SecuritiesController {
  constructor(private readonly securities: SecuritiesService) {}

  @Get()
  list(@Query() query: ListSecuritiesQueryDto) {
    return this.securities.list(query);
  }
}

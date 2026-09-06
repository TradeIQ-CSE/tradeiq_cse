import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListSecuritiesQueryDto } from './dto/list-securities-query.dto';
import { OhlcvQueryDto } from './dto/ohlcv-query.dto';
import { SecuritySymbolParamDto } from './dto/security-symbol-param.dto';
import { SecuritiesService } from './securities.service';

// docs/api/endpoint-catalogue-v0.md §§3–5 — security read APIs.
@Controller('securities')
export class SecuritiesController {
  constructor(private readonly securities: SecuritiesService) {}

  @Get()
  list(@Query() query: ListSecuritiesQueryDto) {
    return this.securities.list(query);
  }

  @Get(':symbol/ohlcv')
  ohlcv(
    @Param() params: SecuritySymbolParamDto,
    @Query() query: OhlcvQueryDto,
  ) {
    return this.securities.ohlcv(params.symbol, query);
  }

  @Get(':symbol')
  detail(@Param() params: SecuritySymbolParamDto) {
    return this.securities.detail(params.symbol);
  }
}

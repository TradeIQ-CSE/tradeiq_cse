import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PublicListSecuritiesQueryDto } from './dto/public-list-securities-query.dto';
import { PublicOhlcvQueryDto } from './dto/public-ohlcv-query.dto';
import { PublicSecuritySymbolParamDto } from './dto/public-security-symbol-param.dto';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicSecuritiesService } from './public-securities.service';

// docs/api/public-api-v1.md §6.1–§6.3.
@UseGuards(ApiKeyGuard)
@UseInterceptors(RateLimitInterceptor)
@Controller('public/v1/securities')
export class PublicSecuritiesController {
  constructor(private readonly securities: PublicSecuritiesService) {}

  @Get()
  list(@Query() query: PublicListSecuritiesQueryDto) {
    return this.securities.list(query);
  }

  @Get(':symbol/ohlcv')
  ohlcv(
    @Param() params: PublicSecuritySymbolParamDto,
    @Query() query: PublicOhlcvQueryDto,
  ) {
    return this.securities.ohlcv(params.symbol, query);
  }

  @Get(':symbol')
  detail(@Param() params: PublicSecuritySymbolParamDto) {
    return this.securities.detail(params.symbol);
  }
}

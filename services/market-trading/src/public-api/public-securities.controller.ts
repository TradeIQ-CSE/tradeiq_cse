import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PublicListSecuritiesQueryDto } from './dto/public-list-securities-query.dto';
import { PublicOhlcvQueryDto } from './dto/public-ohlcv-query.dto';
import { PublicSecuritySymbolParamDto } from './dto/public-security-symbol-param.dto';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicSecuritiesService } from './public-securities.service';
import {
  PublicOhlcvResponseSchema,
  PublicSecurityDetailResponseSchema,
  PublicSecurityListResponseSchema,
  RATE_LIMIT_HEADERS,
  RETRY_AFTER_HEADER,
  SecurityNotFoundErrorSchema,
  UnauthenticatedErrorSchema,
  ValidationFailedErrorSchema,
  RateLimitedErrorSchema,
} from './openapi/schemas';

// docs/api/public-api-v1.md §6.1–§6.3.
@ApiTags('Securities')
@ApiSecurity('apiKey')
@UseGuards(ApiKeyGuard)
@UseInterceptors(RateLimitInterceptor)
@Controller('public/v1/securities')
export class PublicSecuritiesController {
  constructor(private readonly securities: PublicSecuritiesService) {}

  @ApiOperation({
    summary: 'List securities, with their descriptive attributes only.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of securities, ordered by symbol.',
    type: PublicSecurityListResponseSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad sector code, empty search, or page/page_size out of range.',
    type: ValidationFailedErrorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'A valid API key is required.',
    type: UnauthenticatedErrorSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'The key has used up its hourly quota.',
    type: RateLimitedErrorSchema,
    headers: { ...RATE_LIMIT_HEADERS, ...RETRY_AFTER_HEADER },
  })
  @Get()
  list(@Query() query: PublicListSecuritiesQueryDto) {
    return this.securities.list(query);
  }

  @ApiOperation({
    summary:
      'Get the bar series for one security at daily, weekly or monthly resolution.',
  })
  @ApiParam({
    name: 'symbol',
    description: 'Matched case-insensitively.',
    example: 'JKH.N0000',
  })
  @ApiResponse({
    status: 200,
    description: 'The bar series for the requested range.',
    type: PublicOhlcvResponseSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad timeframe, malformed from/to, from after to, or page/page_size out of range.',
    type: ValidationFailedErrorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'A valid API key is required.',
    type: UnauthenticatedErrorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'No security with that symbol.',
    type: SecurityNotFoundErrorSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'The key has used up its hourly quota.',
    type: RateLimitedErrorSchema,
    headers: { ...RATE_LIMIT_HEADERS, ...RETRY_AFTER_HEADER },
  })
  @Get(':symbol/ohlcv')
  ohlcv(
    @Param() params: PublicSecuritySymbolParamDto,
    @Query() query: PublicOhlcvQueryDto,
  ) {
    return this.securities.ohlcv(params.symbol, query);
  }

  @ApiOperation({ summary: 'Get one security by symbol.' })
  @ApiParam({
    name: 'symbol',
    description: 'Matched case-insensitively.',
    example: 'JKH.N0000',
  })
  @ApiResponse({
    status: 200,
    description: 'The security.',
    type: PublicSecurityDetailResponseSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 401,
    description: 'A valid API key is required.',
    type: UnauthenticatedErrorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'No security with that symbol.',
    type: SecurityNotFoundErrorSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'The key has used up its hourly quota.',
    type: RateLimitedErrorSchema,
    headers: { ...RATE_LIMIT_HEADERS, ...RETRY_AFTER_HEADER },
  })
  @Get(':symbol')
  detail(@Param() params: PublicSecuritySymbolParamDto) {
    return this.securities.detail(params.symbol);
  }
}

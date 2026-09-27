import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PublicEodQueryDto } from './dto/public-eod-query.dto';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicEodService } from './public-eod.service';
import {
  PublicEodResponseSchema,
  RATE_LIMIT_HEADERS,
  RETRY_AFTER_HEADER,
  RateLimitedErrorSchema,
  UnauthenticatedErrorSchema,
  ValidationFailedErrorSchema,
} from './openapi/schemas';

// docs/api/public-api-v1.md §6.6.
@ApiTags('End of day')
@ApiSecurity('apiKey')
@UseGuards(ApiKeyGuard)
@UseInterceptors(RateLimitInterceptor)
@Controller('public/v1/eod')
export class PublicEodController {
  constructor(private readonly eod: PublicEodService) {}

  @ApiOperation({
    summary:
      "Get every security's OHLCV and change for one session, the full end-of-day dataset.",
  })
  @ApiResponse({
    status: 200,
    description:
      'A page of end-of-day rows. An empty page with as_of null when the date has no session.',
    type: PublicEodResponseSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed date, or page/page_size out of range.',
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
  get(@Query() query: PublicEodQueryDto) {
    return this.eod.get(query);
  }
}

import { WORKED_EXAMPLES, QUOTA_EXAMPLES } from './openapi/worked-examples';
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
import { PublicIndexCodeParamDto } from './dto/public-index-code-param.dto';
import { PublicIndexValuesQueryDto } from './dto/public-index-values-query.dto';
import { PublicListIndicesQueryDto } from './dto/public-list-indices-query.dto';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicIndicesService } from './public-indices.service';
import {
  IndexNotFoundErrorSchema,
  PublicIndexListResponseSchema,
  PublicIndexValuesResponseSchema,
  RATE_LIMIT_HEADERS,
  RETRY_AFTER_HEADER,
  ExternalRateLimitedErrorSchema,
  UnauthenticatedErrorSchema,
  ValidationFailedErrorSchema,
} from './openapi/schemas';

// docs/api/public-api-v1.md §6.4–§6.5.
@ApiTags('Indices')
@ApiSecurity('apiKey')
@UseGuards(ApiKeyGuard)
@UseInterceptors(RateLimitInterceptor)
@Controller('public/v1/indices')
export class PublicIndicesController {
  constructor(private readonly indices: PublicIndicesService) {}

  @ApiOperation({ summary: 'List every index, each at its own latest value.' })
  @ApiResponse({
    status: 200,
    description: 'A page of indices, ordered by code.',
    type: PublicIndexListResponseSchema,
    examples: WORKED_EXAMPLES['/public/v1/indices'],
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 400,
    description: 'page/page_size out of range.',
    type: ValidationFailedErrorSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 401,
    description: 'A valid API key is required.',
    type: UnauthenticatedErrorSchema,
  })
  @ApiResponse({
    status: 429,
    description:
      'Per-key hourly quota exhausted or per-IP edge throttle. Edge responses may omit reset_at and per-key quota headers.',
    examples: QUOTA_EXAMPLES,
    type: ExternalRateLimitedErrorSchema,
    headers: { ...RATE_LIMIT_HEADERS, ...RETRY_AFTER_HEADER },
  })
  @Get()
  list(@Query() query: PublicListIndicesQueryDto) {
    return this.indices.list(query);
  }

  @ApiOperation({ summary: 'Get the daily close series for one index.' })
  @ApiParam({
    name: 'code',
    schema: { type: 'string', minLength: 1, maxLength: 20 },
    description: 'Matched case-insensitively but otherwise exactly.',
    example: 'SL20',
  })
  @ApiResponse({
    status: 200,
    description: 'The close series for the requested range.',
    type: PublicIndexValuesResponseSchema,
    examples: WORKED_EXAMPLES['/public/v1/indices/{code}/values'],
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 400,
    description:
      'Malformed from/to, from after to, code over 20 characters, or page/page_size out of range.',
    type: ValidationFailedErrorSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 401,
    description: 'A valid API key is required.',
    type: UnauthenticatedErrorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'No index with that code.',
    type: IndexNotFoundErrorSchema,
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiResponse({
    status: 429,
    description:
      'Per-key hourly quota exhausted or per-IP edge throttle. Edge responses may omit reset_at and per-key quota headers.',
    examples: QUOTA_EXAMPLES,
    type: ExternalRateLimitedErrorSchema,
    headers: { ...RATE_LIMIT_HEADERS, ...RETRY_AFTER_HEADER },
  })
  @Get(':code/values')
  values(
    @Param() params: PublicIndexCodeParamDto,
    @Query() query: PublicIndexValuesQueryDto,
  ) {
    return this.indices.values(params.code, query);
  }
}

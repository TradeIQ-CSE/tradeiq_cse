import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

// Swagger-only response shapes for the six public routes
// (docs/api/public-api-v1.md §6). The runtime response shapes stay the
// plain TypeScript interfaces in the *.service.ts files — these classes
// exist only so SwaggerModule.createDocument() has something to reflect on;
// they carry no behaviour and are never constructed or returned by a
// controller. Examples are copied from the contract's own examples so the
// hosted docs never invent a number the contract doesn't already show.

// ---------------------------------------------------------------------------
// Shared: pagination meta (§5) and the sector sub-object (§6.1)
// ---------------------------------------------------------------------------

export class PageMetaSchema {
  @ApiProperty({ example: 1, description: 'The page returned.' })
  page!: number;

  @ApiProperty({ example: 50, description: 'Rows per page.' })
  page_size!: number;

  @ApiProperty({ example: 312, description: 'Total rows across every page.' })
  total!: number;
}

export class SecuritySectorSchema {
  @ApiProperty({ example: '4010', description: 'GICS sector code.' })
  gics_code!: string;

  @ApiProperty({ example: 'Banks' })
  name!: string;
}

// ---------------------------------------------------------------------------
// §6.1 / §6.2 — securities
// ---------------------------------------------------------------------------

export class PublicSecuritySchema {
  @ApiProperty({ example: 'COMB.N0000' })
  symbol!: string;

  @ApiProperty({ example: 'Commercial Bank of Ceylon PLC' })
  company_name!: string;

  @ApiProperty({
    example: 'COMB.N0000',
    nullable: true,
    description:
      'The code CSE publishes for the security, usually identical to symbol. Null when not recorded.',
  })
  cse_code!: string | null;

  @ApiProperty({
    type: SecuritySectorSchema,
    nullable: true,
    description: 'Null for an unclassified security.',
  })
  sector!: SecuritySectorSchema | null;

  @ApiProperty({
    enum: ['listed', 'suspended', 'delisted'],
    example: 'listed',
  })
  listing_status!: 'listed' | 'suspended' | 'delisted';

  @ApiProperty({
    example: 1467151555,
    nullable: true,
    description: 'Null when unknown.',
  })
  shares_outstanding!: number | null;

  @ApiProperty({
    example: '2017-01-02',
    nullable: true,
    description:
      "Start of the security's price coverage window. Null when it has no price history yet.",
  })
  data_from!: string | null;

  @ApiProperty({
    example: '2025-12-31',
    nullable: true,
    description: "End of the security's price coverage window.",
  })
  data_to!: string | null;
}

export class PublicSecurityListResponseSchema {
  @ApiProperty({ type: [PublicSecuritySchema] })
  data!: PublicSecuritySchema[];

  @ApiProperty({ type: PageMetaSchema })
  meta!: PageMetaSchema;
}

export class PublicSecurityDetailResponseSchema {
  @ApiProperty({ type: PublicSecuritySchema })
  data!: PublicSecuritySchema;
}

// ---------------------------------------------------------------------------
// §6.3 — OHLCV bars. Daily bars key on `date`; weekly/monthly bars key on
// `period_start`/`period_end` instead — a genuine union, documented with
// oneOf rather than picked arbitrarily as one shape.
// ---------------------------------------------------------------------------

export class PublicDailyBarSchema {
  @ApiProperty({ example: '2025-01-02' })
  date!: string;

  @ApiProperty({
    example: 22.48,
    nullable: true,
    description:
      'Null when the source data has no reliable opening price for this session.',
  })
  open!: number | null;

  @ApiProperty({ example: 22.59 })
  high!: number;

  @ApiProperty({ example: 22.13 })
  low!: number;

  @ApiProperty({ example: 22.43 })
  close!: number;

  @ApiProperty({ example: 1631334 })
  volume!: number;
}

export class PublicAggregateBarSchema {
  @ApiProperty({ example: '2025-01-06' })
  period_start!: string;

  @ApiProperty({ example: '2025-01-10' })
  period_end!: string;

  @ApiProperty({
    example: 22.43,
    nullable: true,
    description:
      'Null when no day inside the period has a reliable opening price.',
  })
  open!: number | null;

  @ApiProperty({ example: 22.84 })
  high!: number;

  @ApiProperty({ example: 21.75 })
  low!: number;

  @ApiProperty({ example: 22.73 })
  close!: number;

  @ApiProperty({ example: 5186409 })
  volume!: number;
}

@ApiExtraModels(PublicDailyBarSchema, PublicAggregateBarSchema)
export class PublicOhlcvDataSchema {
  @ApiProperty({ example: 'JKH.N0000' })
  symbol!: string;

  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'], example: 'daily' })
  timeframe!: 'daily' | 'weekly' | 'monthly';

  @ApiProperty({ example: '2025-01-01', nullable: true })
  from!: string | null;

  @ApiProperty({ example: '2025-01-03', nullable: true })
  to!: string | null;

  @ApiProperty({
    description:
      'Ascending by date/period. Daily bars key on `date`; weekly/monthly bars key on `period_start`/`period_end` instead.',
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(PublicDailyBarSchema) },
        { $ref: getSchemaPath(PublicAggregateBarSchema) },
      ],
    },
  })
  bars!: (PublicDailyBarSchema | PublicAggregateBarSchema)[];
}

export class PublicOhlcvResponseSchema {
  @ApiProperty({ type: PublicOhlcvDataSchema })
  data!: PublicOhlcvDataSchema;

  @ApiProperty({ type: PageMetaSchema })
  meta!: PageMetaSchema;
}

// ---------------------------------------------------------------------------
// §6.4 / §6.5 — indices
// ---------------------------------------------------------------------------

export class PublicIndexLatestSchema {
  @ApiProperty({ example: '2025-01-10' })
  date!: string;

  @ApiProperty({ example: 15736.91 })
  close!: number;

  @ApiProperty({
    example: -87.4,
    nullable: true,
    description: 'Null when there is no previous value to compare with.',
  })
  change!: number | null;

  @ApiProperty({ example: -0.55, nullable: true })
  change_pct!: number | null;
}

export class PublicIndexSchema {
  @ApiProperty({ example: 'ASPI' })
  code!: string;

  @ApiProperty({ example: 'All Share Price Index' })
  name!: string;

  @ApiProperty({
    type: PublicIndexLatestSchema,
    nullable: true,
    description: 'Null for an index with no value at all.',
  })
  latest!: PublicIndexLatestSchema | null;
}

export class PublicIndexListResponseSchema {
  @ApiProperty({ type: [PublicIndexSchema] })
  data!: PublicIndexSchema[];

  @ApiProperty({ type: PageMetaSchema })
  meta!: PageMetaSchema;
}

export class PublicIndexValueSchema {
  @ApiProperty({ example: '2025-01-02' })
  date!: string;

  @ApiProperty({ example: 4732.06 })
  close!: number;
}

export class PublicIndexValuesDataSchema {
  @ApiProperty({ example: 'SL20' })
  code!: string;

  @ApiProperty({ example: 'S&P Sri Lanka 20' })
  name!: string;

  @ApiProperty({ example: '2025-01-02', nullable: true })
  from!: string | null;

  @ApiProperty({ example: '2025-01-03', nullable: true })
  to!: string | null;

  @ApiProperty({ type: [PublicIndexValueSchema] })
  values!: PublicIndexValueSchema[];
}

export class PublicIndexValuesResponseSchema {
  @ApiProperty({ type: PublicIndexValuesDataSchema })
  data!: PublicIndexValuesDataSchema;

  @ApiProperty({ type: PageMetaSchema })
  meta!: PageMetaSchema;
}

// ---------------------------------------------------------------------------
// §6.6 — end of day
// ---------------------------------------------------------------------------

export class PublicEodRowSchema {
  @ApiProperty({ example: 'COMB.N0000' })
  symbol!: string;

  @ApiProperty({ example: '2025-12-31' })
  date!: string;

  @ApiProperty({ example: 90.1, nullable: true })
  open!: number | null;

  @ApiProperty({ example: 90.55 })
  high!: number;

  @ApiProperty({ example: 88.9 })
  low!: number;

  @ApiProperty({ example: 89.7 })
  close!: number;

  @ApiProperty({ example: 512800 })
  volume!: number;

  @ApiProperty({
    example: -0.8,
    nullable: true,
    description: 'Null when there is no previous session to compare with.',
  })
  change!: number | null;

  @ApiProperty({ example: -0.89, nullable: true })
  change_pct!: number | null;
}

export class PublicEodMetaSchema {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 200 })
  page_size!: number;

  @ApiProperty({ example: 289 })
  total!: number;

  @ApiProperty({
    example: '2025-12-31',
    nullable: true,
    description:
      'The session actually returned. Null when the requested date has no session.',
  })
  as_of!: string | null;
}

export class PublicEodResponseSchema {
  @ApiProperty({ type: [PublicEodRowSchema] })
  data!: PublicEodRowSchema[];

  @ApiProperty({ type: PublicEodMetaSchema })
  meta!: PublicEodMetaSchema;
}

// ---------------------------------------------------------------------------
// Error envelope (docs/api/error-envelope.md), one class per code this
// surface actually returns (§6's per-resource error tables).
// ---------------------------------------------------------------------------

export class ApiErrorFieldSchema {
  @ApiProperty({ example: 'page_size' })
  field!: string;

  @ApiProperty({ example: 'must not be greater than 200' })
  reason!: string;
}

class ValidationFailedErrorBodySchema {
  @ApiProperty({ enum: ['VALIDATION_FAILED'], example: 'VALIDATION_FAILED' })
  code!: 'VALIDATION_FAILED';

  @ApiProperty({ example: 'Request validation failed.' })
  message!: string;

  @ApiProperty({ type: [ApiErrorFieldSchema] })
  fields!: ApiErrorFieldSchema[];

  @ApiProperty({ example: '01J6Z8Y2K0QF3M4X0T8Y0W3B7R' })
  trace_id!: string;
}

export class ValidationFailedErrorSchema {
  @ApiProperty({ type: ValidationFailedErrorBodySchema })
  error!: ValidationFailedErrorBodySchema;
}

class UnauthenticatedErrorBodySchema {
  @ApiProperty({ enum: ['UNAUTHENTICATED'], example: 'UNAUTHENTICATED' })
  code!: 'UNAUTHENTICATED';

  @ApiProperty({ example: 'A valid API key is required' })
  message!: string;

  @ApiProperty({ example: '01J6Z8Y2K0QF3M4X0T8Y0W3B7R' })
  trace_id!: string;
}

export class UnauthenticatedErrorSchema {
  @ApiProperty({ type: UnauthenticatedErrorBodySchema })
  error!: UnauthenticatedErrorBodySchema;
}

class SecurityNotFoundErrorBodySchema {
  @ApiProperty({ enum: ['SECURITY_NOT_FOUND'], example: 'SECURITY_NOT_FOUND' })
  code!: 'SECURITY_NOT_FOUND';

  @ApiProperty({ example: 'Security not found.' })
  message!: string;

  @ApiProperty({ example: '01J6Z8Y2K0QF3M4X0T8Y0W3B7R' })
  trace_id!: string;
}

export class SecurityNotFoundErrorSchema {
  @ApiProperty({ type: SecurityNotFoundErrorBodySchema })
  error!: SecurityNotFoundErrorBodySchema;
}

class IndexNotFoundErrorBodySchema {
  @ApiProperty({ enum: ['INDEX_NOT_FOUND'], example: 'INDEX_NOT_FOUND' })
  code!: 'INDEX_NOT_FOUND';

  @ApiProperty({ example: 'Index not found.' })
  message!: string;

  @ApiProperty({ example: '01J6Z8Y2K0QF3M4X0T8Y0W3B7R' })
  trace_id!: string;
}

export class IndexNotFoundErrorSchema {
  @ApiProperty({ type: IndexNotFoundErrorBodySchema })
  error!: IndexNotFoundErrorBodySchema;
}

class RateLimitedErrorBodySchema {
  @ApiProperty({ enum: ['RATE_LIMITED'], example: 'RATE_LIMITED' })
  code!: 'RATE_LIMITED';

  @ApiProperty({ example: 'Rate limit exceeded.' })
  message!: string;

  @ApiProperty({
    example: '2026-09-26T10:00:00Z',
    description: 'RFC 3339 UTC instant the count resets.',
  })
  reset_at!: string;

  @ApiProperty({ example: '01J6Z8Y2K0QF3M4X0T8Y0W3B7R' })
  trace_id!: string;
}

export class RateLimitedErrorSchema {
  @ApiProperty({ type: RateLimitedErrorBodySchema })
  error!: RateLimitedErrorBodySchema;
}

// ---------------------------------------------------------------------------
// Shared response-header descriptions (docs/api/public-api-v1.md §3).
// Spread into @ApiResponse({ headers: ... }) on every keyed 2xx/4xx route.
// ---------------------------------------------------------------------------

export const RATE_LIMIT_HEADERS = {
  'X-RateLimit-Limit': {
    description: 'The hourly limit in force for this key.',
    schema: { type: 'string', example: '100' },
  },
  'X-RateLimit-Remaining': {
    description:
      'Requests left in the current UTC clock hour. Left out if the counter was briefly unavailable.',
    schema: { type: 'string', example: '99' },
  },
  'X-RateLimit-Reset': {
    description: 'RFC 3339 UTC instant the count resets.',
    schema: { type: 'string', example: '2026-09-26T10:00:00Z' },
  },
} as const;

export const RETRY_AFTER_HEADER = {
  'Retry-After': {
    description: 'Seconds until the count resets, mirroring reset_at.',
    schema: { type: 'string', example: '1800' },
  },
} as const;

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /public/v1/indices/{code}/values query params —
// docs/api/public-api-v1.md §6.5.
export class PublicIndexValuesQueryDto {
  @ApiPropertyOptional({
    description:
      'Valid YYYY-MM-DD calendar date; range start (inclusive). Defaults to `to` minus 1 year.',
    type: 'string',
    format: 'date',
    example: '2025-01-02',
  })
  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Valid YYYY-MM-DD calendar date; range end (inclusive). Defaults to the latest date any index has a value for.',
    type: 'string',
    format: 'date',
    example: '2025-01-03',
  })
  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  to?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 1000,
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page_size = 500;
}

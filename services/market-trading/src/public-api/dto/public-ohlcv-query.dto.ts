import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

export type PublicOhlcvTimeframe = 'daily' | 'weekly' | 'monthly';

// GET /public/v1/securities/{symbol}/ohlcv query params —
// docs/api/public-api-v1.md §6.3. `from`/`to` ordering depends on defaults
// resolved from stored data, so it is checked once the final range is known
// (PublicSecuritiesService reuses SecuritiesService.ohlcv() for that).
export class PublicOhlcvQueryDto {
  @ApiPropertyOptional({
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily',
  })
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  timeframe: PublicOhlcvTimeframe = 'daily';

  @ApiPropertyOptional({
    description:
      'Valid YYYY-MM-DD calendar date; range start (inclusive). Defaults to `to` minus 1 year.',
    type: 'string',
    format: 'date',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Valid YYYY-MM-DD calendar date; range end (inclusive). Defaults to the latest completed session.',
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

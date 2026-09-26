import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

export type PublicOhlcvTimeframe = 'daily' | 'weekly' | 'monthly';

// GET /public/v1/securities/{symbol}/ohlcv query params —
// docs/api/public-api-v1.md §6.3. `from`/`to` ordering depends on defaults
// resolved from stored data, so it is checked once the final range is known
// (PublicSecuritiesService reuses SecuritiesService.ohlcv() for that).
export class PublicOhlcvQueryDto {
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  timeframe: PublicOhlcvTimeframe = 'daily';

  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  from?: string;

  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page_size = 500;
}

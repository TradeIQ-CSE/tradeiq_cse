import { IsIn, IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

export type OhlcvTimeframe = 'daily' | 'weekly' | 'monthly';

// GET /securities/{symbol}/ohlcv query parameters — endpoint catalogue §5.
// Date ordering depends on defaults resolved from stored market data, so it is
// checked in SecuritiesService after the final range has been determined.
export class OhlcvQueryDto {
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  timeframe: OhlcvTimeframe = 'daily';

  @IsOptional()
  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  from?: string;

  @IsOptional()
  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  to?: string;
}

import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /indices/{code}/values query params — endpoint catalogue §10. As with
// OHLCV, date ordering depends on defaults resolved from stored data, so it is
// checked in IndicesService once the final range is known.
export class IndexValuesQueryDto {
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

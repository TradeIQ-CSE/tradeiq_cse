import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /indices query params — docs/api/endpoint-catalogue-v0.md §9.
export class ListIndicesQueryDto {
  // Each index reports its latest value on or before this date. Omitted means
  // the latest value it has.
  @IsOptional()
  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  as_of?: string;
}

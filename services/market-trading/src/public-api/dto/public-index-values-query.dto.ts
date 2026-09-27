import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /public/v1/indices/{code}/values query params —
// docs/api/public-api-v1.md §6.5.
export class PublicIndexValuesQueryDto {
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

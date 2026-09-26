import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /public/v1/eod query params — docs/api/public-api-v1.md §6.6.
export class PublicEodQueryDto {
  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page_size = 200;
}

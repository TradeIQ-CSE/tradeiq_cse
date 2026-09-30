import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /public/v1/eod query params — docs/api/public-api-v1.md §6.6.
export class PublicEodQueryDto {
  @ApiPropertyOptional({
    description:
      'Valid YYYY-MM-DD calendar date for the session to return. Defaults to the latest completed session.',
    type: 'string',
    format: 'date',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  date?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 500,
    default: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page_size = 200;
}

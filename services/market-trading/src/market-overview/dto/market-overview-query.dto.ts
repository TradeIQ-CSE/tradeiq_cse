import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

export class MarketOverviewQueryDto {
  @IsOptional()
  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  as_of?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsIn(['large', 'mid', 'small'])
  market_cap?: 'large' | 'mid' | 'small';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

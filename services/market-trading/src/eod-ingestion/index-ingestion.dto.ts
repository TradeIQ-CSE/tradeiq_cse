import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsDefined,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../common/validation/is-calendar-date';

class IndexCalendarDto {
  @Equals(true)
  is_trading_day!: true;

  @IsString()
  @Length(1, 200)
  source!: string;
}

class IndexCloseDto {
  @Matches(/^[A-Z0-9]{1,20}$/, { message: 'must be an uppercase index code' })
  code!: string;

  // Positive and within numeric(14,4). A series the exchange didn't publish is
  // left out, never sent as zero.
  @Matches(/^(?!0+(?:\.0+)?$)(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/, {
    message: 'must be a positive decimal string with at most four places',
  })
  close!: string;
}

// docs/api/index-ingestion-v1.md
export class IndexIngestionDto {
  @IsCalendarDate({ message: 'must be a calendar date in YYYY-MM-DD form' })
  trade_date!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => IndexCalendarDto)
  calendar!: IndexCalendarDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique((value: IndexCloseDto) => value.code)
  @ValidateNested({ each: true })
  @Type(() => IndexCloseDto)
  values!: IndexCloseDto[];
}

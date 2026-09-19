import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /internal/paper-trading/valuation-series query params —
// docs/api/paper-trading-v1.md §2.5.
//
// Property names match the wire query params 1:1 so validation errors report
// the field the caller actually sent (error-envelope.md §1).
export class ValuationSeriesQueryDto {
  // Same comma-separated form and 200-symbol cap as §2.4: the caller builds
  // this from the symbols a portfolio has ever held, and an empty list is a
  // valid request for the session list alone — an all-cash portfolio still
  // has a value on every session.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((symbol) => symbol.trim())
          .filter((symbol) => symbol.length > 0)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Length(1, 20, { each: true })
  symbols: string[] = [];

  // Window bounds, defaulted from stored market data exactly as the OHLCV
  // endpoint defaults them (securities.service.ts): `to` is the latest session,
  // `from` one calendar year before it. Ordering is checked in the service,
  // after the defaults have been resolved.
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

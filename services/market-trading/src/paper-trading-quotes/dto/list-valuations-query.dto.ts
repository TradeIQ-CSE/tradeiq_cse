import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// GET /internal/paper-trading/valuations query params —
// docs/api/paper-trading-v1.md §2.4.
//
// Property names match the wire query params 1:1 so validation errors report
// the field the caller actually sent (error-envelope.md §1).
export class ListValuationsQueryDto {
  // Sent as one comma-separated value rather than repeated `symbols=` params:
  // the caller builds it from a portfolio's held symbols, and a single string
  // keeps the URL stable and easy to log. An empty or absent value is a valid
  // request for the session alone (§2.4), which is what an empty portfolio
  // needs, so blank entries are dropped instead of failing validation.
  //
  // The 200 cap bounds the query; no paper portfolio comes close, and an
  // unbounded list would let one request name every security in the market.
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
  // Mirrors market_data.securities.symbol varchar(20), as in
  // quote-symbol-param.dto.ts. Matching is case-insensitive and the canonical
  // stored form is echoed back, so no case constraint belongs here.
  @Length(1, 20, { each: true })
  symbols: string[] = [];

  // The session every price in the response is taken from. Omitted means the
  // latest session with data; the response always echoes the date used.
  @IsOptional()
  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  as_of?: string;
}

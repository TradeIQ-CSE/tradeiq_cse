import { IsString, Length } from 'class-validator';

// :symbol on /watchlist/:symbol. Matched case-insensitively like the
// securities routes; the varchar(20) bound is enforced at the boundary.
export class WatchlistSymbolParamDto {
  @IsString()
  @Length(1, 20)
  symbol!: string;
}

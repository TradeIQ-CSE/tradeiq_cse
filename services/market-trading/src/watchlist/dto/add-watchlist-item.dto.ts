import { IsString, Length } from 'class-validator';

// Body of POST /watchlist. Matched case-insensitively like the securities
// routes; the varchar(20) bound is enforced at the boundary.
export class AddWatchlistItemDto {
  @IsString()
  @Length(1, 20)
  symbol!: string;
}

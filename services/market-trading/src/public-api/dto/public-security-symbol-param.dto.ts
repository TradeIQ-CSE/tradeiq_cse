import { IsString, Length } from 'class-validator';

// Path parameter for /public/v1/securities/{symbol} and its /ohlcv route.
// Matched case-insensitively; the varchar(20) bound is enforced here so a
// malformed value gets the standard validation envelope rather than a raw
// "no rows" 404.
export class PublicSecuritySymbolParamDto {
  @IsString()
  @Length(1, 20)
  symbol!: string;
}

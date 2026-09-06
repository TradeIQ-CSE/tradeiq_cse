import { IsString, Length } from 'class-validator';

// Path parameter shared by the detail and OHLCV routes. Symbols are matched
// case-insensitively, while the database's varchar(20) bound is enforced at
// the HTTP boundary so malformed input uses the standard validation envelope.
export class SecuritySymbolParamDto {
  @IsString()
  @Length(1, 20)
  symbol!: string;
}

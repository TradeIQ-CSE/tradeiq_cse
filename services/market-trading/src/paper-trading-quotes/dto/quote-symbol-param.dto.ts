import { IsString, Length } from 'class-validator';

// Path param for GET /internal/paper-trading/quotes/{symbol}.
// The symbol is matched case-insensitively and the canonical stored form is
// echoed back, so no case constraint belongs here. The length cap mirrors
// market_data.securities.symbol varchar(20).
export class QuoteSymbolParamDto {
  @IsString()
  @Length(1, 20)
  symbol!: string;
}

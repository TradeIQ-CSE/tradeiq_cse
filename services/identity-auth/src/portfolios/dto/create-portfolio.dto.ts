import { Transform } from 'class-transformer';
import { IsNumber, IsString, Length, Max, Min } from 'class-validator';

// POST /portfolios body — docs/api/paper-trading-v1.md §5.1. Property names
// match the wire body 1:1 so validation errors report the field the client
// actually sent (error-envelope.md §1).
export class CreatePortfolioDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(100000)
  @Max(100000000)
  starting_capital!: number;
}

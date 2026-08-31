import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

// Request body for POST /portfolios/:portfolioId/orders and
// .../orders/estimate — docs/api/paper-trading-v1.md §6.1, §6.2.
//
// The SPA sends whatever the user typed ("comb.n0000"), so the symbol is
// upper-cased here: canonical symbols are what cross the service boundary (§1).
export class SubmitOrderDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Z0-9.]+$/, {
    message: 'must contain only letters, digits and dots',
  })
  symbol!: string;

  @IsIn(['buy', 'sell'])
  side!: 'buy' | 'sell';

  // §2.1 — a positive 32-bit integer. The upper bound keeps a nonsense
  // quantity out of the pricing maths; the transaction-value limit (§3.2)
  // rejects anything genuinely oversized with a proper rejection code.
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;
}

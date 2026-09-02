import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

// Query params for GET /portfolios/{portfolio_id}/positions and /summary —
// docs/api/paper-trading-v1.md §7.
//
// Bounds are not checked here: market-trading owns the available price range
// and answers VALIDATION_FAILED for a date outside it (§2.4), which the client
// passes straight through. This only rejects a value that is not a date at all,
// so a typo never reaches the other service.
export class ValuationQueryDto {
  @IsOptional()
  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  as_of?: string;
}

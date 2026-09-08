import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// GET /portfolios/:portfolioId/orders — docs/api/paper-trading-v1.md §6.3.
export class ListOrdersQueryDto {
  // Only the two terminal states are filterable: v1 orders are either filled
  // or rejected the moment they are submitted.
  @IsOptional()
  @IsIn(['filled', 'rejected'])
  status?: 'filled' | 'rejected';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  page_size = 50;
}

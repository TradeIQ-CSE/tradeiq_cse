import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// GET /securities query params — docs/api/endpoint-catalogue-v0.md §3.
// Property names match the wire query params 1:1 so validation errors report
// the field name the client actually sent (error-envelope.md §1).
export class ListSecuritiesQueryDto {
  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsIn(['symbol', 'company_name'])
  sort: 'symbol' | 'company_name' = 'symbol';

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

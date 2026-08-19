import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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

  // Trading date the whole page is priced at. Omitted means the latest date
  // that has price data; meta.as_of always echoes the date actually used, so a
  // client never has to guess which day it is looking at.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  as_of?: string;

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

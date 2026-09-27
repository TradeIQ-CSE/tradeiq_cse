import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// GET /public/v1/securities query params — docs/api/public-api-v1.md §6.1.
// Deliberately its own DTO, not endpoint-catalogue-v0's ListSecuritiesQueryDto:
// the public resource has no `as_of`/`sort`, and its page_size bounds/default
// differ, so a change to the internal query shape can never silently change
// this one.
export class PublicListSecuritiesQueryDto {
  @ApiPropertyOptional({
    description: 'A known GICS sector code, e.g. 4010.',
    example: '4010',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  sector?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive: prefix match on symbol, substring match on company name.',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  page_size = 50;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// GET /public/v1/indices query params — docs/api/public-api-v1.md §6.4.
export class PublicListIndicesQueryDto {
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

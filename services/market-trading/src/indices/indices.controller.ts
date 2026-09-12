import { Controller, Get, Param, Query } from '@nestjs/common';
import { IndexCodeParamDto } from './dto/index-code-param.dto';
import { IndexValuesQueryDto } from './dto/index-values-query.dto';
import { ListIndicesQueryDto } from './dto/list-indices-query.dto';
import { IndicesService } from './indices.service';

// docs/api/endpoint-catalogue-v0.md §§9–10 — market index read APIs. Served
// from market-trading's own market_data database, like every market read.
@Controller('indices')
export class IndicesController {
  constructor(private readonly indices: IndicesService) {}

  @Get()
  list(@Query() query: ListIndicesQueryDto) {
    return this.indices.list(query);
  }

  @Get(':code/values')
  values(
    @Param() params: IndexCodeParamDto,
    @Query() query: IndexValuesQueryDto,
  ) {
    return this.indices.values(params.code, query);
  }
}

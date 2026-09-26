import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PublicIndexCodeParamDto } from './dto/public-index-code-param.dto';
import { PublicIndexValuesQueryDto } from './dto/public-index-values-query.dto';
import { PublicListIndicesQueryDto } from './dto/public-list-indices-query.dto';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicIndicesService } from './public-indices.service';

// docs/api/public-api-v1.md §6.4–§6.5.
@UseGuards(ApiKeyGuard)
@UseInterceptors(RateLimitInterceptor)
@Controller('public/v1/indices')
export class PublicIndicesController {
  constructor(private readonly indices: PublicIndicesService) {}

  @Get()
  list(@Query() query: PublicListIndicesQueryDto) {
    return this.indices.list(query);
  }

  @Get(':code/values')
  values(
    @Param() params: PublicIndexCodeParamDto,
    @Query() query: PublicIndexValuesQueryDto,
  ) {
    return this.indices.values(params.code, query);
  }
}

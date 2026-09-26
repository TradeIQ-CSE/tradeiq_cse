import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PublicEodQueryDto } from './dto/public-eod-query.dto';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicEodService } from './public-eod.service';

// docs/api/public-api-v1.md §6.6.
@UseGuards(ApiKeyGuard)
@UseInterceptors(RateLimitInterceptor)
@Controller('public/v1/eod')
export class PublicEodController {
  constructor(private readonly eod: PublicEodService) {}

  @Get()
  get(@Query() query: PublicEodQueryDto) {
    return this.eod.get(query);
  }
}

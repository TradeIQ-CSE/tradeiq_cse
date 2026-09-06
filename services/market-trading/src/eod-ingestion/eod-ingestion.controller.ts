import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { EodIngestionService } from './eod-ingestion.service';
import { parseEodIngestionRequest } from './eod-ingestion.validation';
import { IngestionAuthGuard } from './ingestion-auth.guard';

const SHA256 = /^[a-f0-9]{64}$/;

@Controller('internal/v1/ingestions/eod')
@UseGuards(IngestionAuthGuard)
export class EodIngestionController {
  constructor(private readonly ingestion: EodIngestionService) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = parseEodIngestionRequest(body);
    if (!parsed.request) throw new ValidationFailedException(parsed.fields);
    return { data: await this.ingestion.ingest(parsed.request) };
  }

  @Get('latest')
  async latest() {
    return { data: await this.ingestion.findLatest() };
  }

  @Get(':batchId')
  async get(@Param('batchId') batchId: string) {
    if (!SHA256.test(batchId)) {
      throw new ValidationFailedException([
        { field: 'batchId', reason: 'must be a lowercase SHA-256 hex digest' },
      ]);
    }
    const found = await this.ingestion.findByBatchId(batchId);
    if (!found) {
      throw new ApiException(404, 'NOT_FOUND', 'Ingestion batch not found.');
    }
    return { data: found };
  }
}

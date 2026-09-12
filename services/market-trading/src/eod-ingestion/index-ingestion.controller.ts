import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IndexIngestionDto } from './index-ingestion.dto';
import { IndexIngestionService } from './index-ingestion.service';
import { IngestionAuthGuard } from './ingestion-auth.guard';

@Controller('internal/v1/ingestions/indices')
@UseGuards(IngestionAuthGuard)
export class IndexIngestionController {
  constructor(private readonly ingestion: IndexIngestionService) {}

  @Post()
  create(@Body() body: IndexIngestionDto) {
    return this.ingestion.ingest(body);
  }
}

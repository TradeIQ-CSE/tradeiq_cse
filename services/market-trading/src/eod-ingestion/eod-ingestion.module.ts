import { Module } from '@nestjs/common';
import { EodIngestionController } from './eod-ingestion.controller';
import { EodIngestionService } from './eod-ingestion.service';
import { IndexIngestionController } from './index-ingestion.controller';
import { IndexIngestionService } from './index-ingestion.service';
import { IngestionAuthGuard } from './ingestion-auth.guard';

@Module({
  controllers: [EodIngestionController, IndexIngestionController],
  providers: [EodIngestionService, IndexIngestionService, IngestionAuthGuard],
})
export class EodIngestionModule {}

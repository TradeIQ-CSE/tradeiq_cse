import { Module } from '@nestjs/common';
import { EodIngestionController } from './eod-ingestion.controller';
import { EodIngestionService } from './eod-ingestion.service';
import { IngestionAuthGuard } from './ingestion-auth.guard';

@Module({
  controllers: [EodIngestionController],
  providers: [EodIngestionService, IngestionAuthGuard],
})
export class EodIngestionModule {}

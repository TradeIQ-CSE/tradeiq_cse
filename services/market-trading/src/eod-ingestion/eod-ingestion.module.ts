import { Module } from '@nestjs/common';
import { DataCoverageModule } from '../data-coverage/data-coverage.module';
import { EodIngestionController } from './eod-ingestion.controller';
import { EodIngestionService } from './eod-ingestion.service';
import { IndexIngestionController } from './index-ingestion.controller';
import { IndexIngestionService } from './index-ingestion.service';
import { IngestionAuthGuard } from './ingestion-auth.guard';

@Module({
  imports: [DataCoverageModule],
  controllers: [EodIngestionController, IndexIngestionController],
  providers: [EodIngestionService, IndexIngestionService, IngestionAuthGuard],
})
export class EodIngestionModule {}

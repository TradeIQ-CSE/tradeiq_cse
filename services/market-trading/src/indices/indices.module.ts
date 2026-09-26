import { Module } from '@nestjs/common';
import { IndicesController } from './indices.controller';
import { IndicesService } from './indices.service';

@Module({
  controllers: [IndicesController],
  providers: [IndicesService],
  // PublicIndicesService (src/public-api) reuses list()/values() and paginates
  // over their results, rather than duplicating the "own latest date" and
  // gap-tolerant "previous value" logic.
  exports: [IndicesService],
})
export class IndicesModule {}

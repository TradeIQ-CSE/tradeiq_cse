import { Module } from '@nestjs/common';
import { DataCoverageController } from './data-coverage.controller';
import { DataCoverageService } from './data-coverage.service';

@Module({
  controllers: [DataCoverageController],
  providers: [DataCoverageService],
  exports: [DataCoverageService],
})
export class DataCoverageModule {}

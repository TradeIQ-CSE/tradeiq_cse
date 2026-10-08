import { Controller, Get } from '@nestjs/common';
import { DataCoverageService } from './data-coverage.service';

// docs/api/data-coverage.md §1 — public, unauthenticated market-data
// read, same envelope as /securities and /indices (docs/api/endpoint-catalogue-v0.md).
@Controller('coverage')
export class DataCoverageController {
  constructor(private readonly coverage: DataCoverageService) {}

  @Get()
  get() {
    return this.coverage.get();
  }
}

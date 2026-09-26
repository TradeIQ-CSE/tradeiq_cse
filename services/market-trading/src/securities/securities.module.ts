import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security } from '../entities/security.entity';
import { Sector } from '../entities/sector.entity';
import { SecuritiesController } from './securities.controller';
import { SecuritiesService } from './securities.service';

@Module({
  imports: [TypeOrmModule.forFeature([Security, Sector])],
  controllers: [SecuritiesController],
  providers: [SecuritiesService],
  // PublicSecuritiesService (src/public-api) reuses ohlcv()'s aggregation and
  // clamping logic, and detail()'s listing_status/cse_code computation, so an
  // internal change to either can never silently diverge from the public
  // contract's own copy of the same rules.
  exports: [SecuritiesService],
})
export class SecuritiesModule {}

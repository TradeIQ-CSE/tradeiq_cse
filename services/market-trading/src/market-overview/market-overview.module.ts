import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sector } from '../entities/sector.entity';
import { Security } from '../entities/security.entity';
import { MarketOverviewController } from './market-overview.controller';
import { MarketOverviewService } from './market-overview.service';

@Module({
  imports: [TypeOrmModule.forFeature([Security, Sector])],
  controllers: [MarketOverviewController],
  providers: [MarketOverviewService],
})
export class MarketOverviewModule {}

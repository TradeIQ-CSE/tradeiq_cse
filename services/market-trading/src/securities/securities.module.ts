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
})
export class SecuritiesModule {}

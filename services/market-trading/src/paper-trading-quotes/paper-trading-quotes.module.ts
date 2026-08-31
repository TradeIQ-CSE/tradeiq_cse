import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security } from '../entities/security.entity';
import { PaperTradingQuotesController } from './paper-trading-quotes.controller';
import { PaperTradingQuotesService } from './paper-trading-quotes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Security])],
  controllers: [PaperTradingQuotesController],
  providers: [PaperTradingQuotesService],
})
export class PaperTradingQuotesModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashTransaction } from '../entities/cash-transaction.entity';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';
import { VirtualPortfolio } from '../entities/virtual-portfolio.entity';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VirtualPortfolio,
      CashTransaction,
      IdempotencyRecord,
    ]),
  ],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
})
export class PortfoliosModule {}

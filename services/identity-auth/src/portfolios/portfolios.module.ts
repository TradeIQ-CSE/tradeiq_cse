import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashTransaction } from '../entities/cash-transaction.entity';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';
import { VirtualPortfolio } from '../entities/virtual-portfolio.entity';
import { MarketTradingModule } from '../market-trading/market-trading.module';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VirtualPortfolio,
      CashTransaction,
      IdempotencyRecord,
    ]),
    // §7 prices open positions through the market-data boundary.
    MarketTradingModule,
  ],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
})
export class PortfoliosModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CashTransaction } from '../entities/cash-transaction.entity';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';
import { VirtualPortfolio } from '../entities/virtual-portfolio.entity';
import { PaperTradingQuotesModule } from '../paper-trading-quotes/paper-trading-quotes.module';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      VirtualPortfolio,
      CashTransaction,
      IdempotencyRecord,
    ]),
    // §7 prices open positions through the market-data boundary.
    PaperTradingQuotesModule,
  ],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
})
export class PortfoliosModule {}

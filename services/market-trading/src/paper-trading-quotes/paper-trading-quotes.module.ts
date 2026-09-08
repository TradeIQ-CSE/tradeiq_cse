import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security } from '../entities/security.entity';
import { PaperTradingQuotesService } from './paper-trading-quotes.service';

// docs/api/paper-trading-v1.md §2.3, §2.4 — the quote and valuation rules the
// order and portfolio paths price against. These were REST endpoints while
// paper trading lived in identity-auth; both callers are now in this service,
// so the service is exported directly and there is no controller.
@Module({
  imports: [TypeOrmModule.forFeature([Security])],
  providers: [PaperTradingQuotesService],
  exports: [PaperTradingQuotesService],
})
export class PaperTradingQuotesModule {}

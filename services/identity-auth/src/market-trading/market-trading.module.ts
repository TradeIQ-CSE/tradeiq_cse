import { Module } from '@nestjs/common';
import { MarketTradingClient } from './market-trading.client';

@Module({
  providers: [MarketTradingClient],
  exports: [MarketTradingClient],
})
export class MarketTradingModule {}

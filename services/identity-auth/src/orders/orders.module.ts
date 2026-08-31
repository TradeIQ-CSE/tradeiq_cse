import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fill } from '../entities/fill.entity';
import { FillFee } from '../entities/fill-fee.entity';
import { LotDisposal } from '../entities/lot-disposal.entity';
import { PaperOrder } from '../entities/paper-order.entity';
import { PositionLot } from '../entities/position-lot.entity';
import { MarketTradingModule } from '../market-trading/market-trading.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaperOrder,
      Fill,
      FillFee,
      PositionLot,
      LotDisposal,
    ]),
    MarketTradingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

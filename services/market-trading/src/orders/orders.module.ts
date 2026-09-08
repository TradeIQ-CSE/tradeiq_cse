import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Fill } from '../entities/fill.entity';
import { FillFee } from '../entities/fill-fee.entity';
import { LotDisposal } from '../entities/lot-disposal.entity';
import { PaperOrder } from '../entities/paper-order.entity';
import { PositionLot } from '../entities/position-lot.entity';
import { PaperTradingQuotesModule } from '../paper-trading-quotes/paper-trading-quotes.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      PaperOrder,
      Fill,
      FillFee,
      PositionLot,
      LotDisposal,
    ]),
    PaperTradingQuotesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ListFillsQueryDto } from './dto/list-fills-query.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderParamsDto, PortfolioIdParamDto } from './dto/order-params.dto';
import { SubmitOrderDto } from './dto/submit-order.dto';
import { OrdersService } from './orders.service';

// docs/api/paper-trading-v1.md §6 — order submission, retrieval and fills.
// Authenticated by the global JwtAuthGuard; ownership is enforced in the
// service from the verified user id, never from the path.
@Controller('portfolios/:portfolioId')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // §6.1 — pre-trade cost preview. Reserves nothing and writes nothing.
  // A preview is not a created resource, so it answers 200 rather than the
  // 201 Nest gives a POST by default.
  @Post('orders/estimate')
  @HttpCode(HttpStatus.OK)
  async estimate(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PortfolioIdParamDto,
    @Body() dto: SubmitOrderDto,
  ) {
    return {
      data: await this.orders.estimate(user.userId, params.portfolioId, dto),
    };
  }

  // §6.2 — always 201 for a well-formed request: a domain rejection is a
  // persisted order with status 'rejected', not an error.
  @Post('orders')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PortfolioIdParamDto,
    @Body() dto: SubmitOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { body, replayed } = await this.orders.submit(
      user.userId,
      params.portfolioId,
      dto,
      idempotencyKey,
    );
    if (replayed) res.set('Idempotent-Replayed', 'true');
    res.status(HttpStatus.CREATED);
    return { data: body };
  }

  // §6.3
  @Get('orders')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PortfolioIdParamDto,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.orders.list(user.userId, params.portfolioId, query);
  }

  // §6.4
  @Get('orders/:orderId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: OrderParamsDto,
  ) {
    return {
      data: await this.orders.get(
        user.userId,
        params.portfolioId,
        params.orderId,
      ),
    };
  }

  // §6.5
  @Get('fills')
  listFills(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PortfolioIdParamDto,
    @Query() query: ListFillsQueryDto,
  ) {
    return this.orders.listFills(user.userId, params.portfolioId, query);
  }
}

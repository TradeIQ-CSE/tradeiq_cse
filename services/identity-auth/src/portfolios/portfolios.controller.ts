import {
  Body,
  Controller,
  Delete,
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
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { ListCashTransactionsQueryDto } from './dto/list-cash-transactions-query.dto';
import { ListPortfoliosQueryDto } from './dto/list-portfolios-query.dto';
import { PortfolioIdParamDto } from './dto/portfolio-id-param.dto';
import { PortfoliosService } from './portfolios.service';

// docs/api/paper-trading-v1.md §5 — virtual portfolios and cash-ledger
// history. Every route here is authenticated by the global JwtAuthGuard;
// ownership is enforced in the service via the verified user id.
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfolios: PortfoliosService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePortfolioDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { body, replayed } = await this.portfolios.create(
      user.userId,
      dto,
      idempotencyKey,
    );
    if (replayed) {
      res.set('Idempotent-Replayed', 'true');
    }
    res.status(HttpStatus.CREATED);
    return { data: body };
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPortfoliosQueryDto,
  ) {
    return this.portfolios.list(user.userId, query);
  }

  @Get(':portfolioId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { portfolioId }: PortfolioIdParamDto,
  ) {
    return { data: await this.portfolios.get(user.userId, portfolioId) };
  }

  @Delete(':portfolioId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { portfolioId }: PortfolioIdParamDto,
  ) {
    return this.portfolios.remove(user.userId, portfolioId);
  }

  @Get(':portfolioId/cash-transactions')
  listCashTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { portfolioId }: PortfolioIdParamDto,
    @Query() query: ListCashTransactionsQueryDto,
  ) {
    return this.portfolios.listCashTransactions(
      user.userId,
      portfolioId,
      query,
    );
  }
}

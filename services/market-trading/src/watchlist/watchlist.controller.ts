import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddWatchlistItemDto } from './dto/add-watchlist-item.dto';
import { WatchlistSymbolParamDto } from './dto/watchlist-symbol-param.dto';
import { WatchlistService } from './watchlist.service';

// docs/api/watchlist-v1.md. The list belongs to the verified user; there is
// no watchlist id to pass or guess.
@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.watchlist.get(user.userId) };
  }

  // Answers 200, not 201: following a security twice is a no-op (§3.2), so
  // the call does not always create anything.
  @Post()
  @HttpCode(HttpStatus.OK)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() { symbol }: AddWatchlistItemDto,
  ) {
    return { data: await this.watchlist.add(user.userId, symbol) };
  }

  @Delete(':symbol')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { symbol }: WatchlistSymbolParamDto,
  ) {
    return this.watchlist.remove(user.userId, symbol);
  }
}

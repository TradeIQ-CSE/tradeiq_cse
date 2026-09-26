import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpsertApiKeyDto } from './dto/upsert-api-key.dto';
import { DeveloperKeysService } from './developer-keys.service';

// docs/api/public-api-v1.md §7 — an internal, JWT-authenticated surface
// (reached from the SPA's Settings page), not part of the public /public/v1
// API and not key-authenticated. Every route acts only on the signed-in
// user's own key; there is never a key id in a path or body.
@UseGuards(JwtAuthGuard)
@Controller('developer')
export class DeveloperKeysController {
  constructor(private readonly keys: DeveloperKeysService) {}

  @Get('key')
  async get(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.keys.get(user.userId) };
  }

  // §7.2 — 201, carrying the full secret. It never appears again after
  // this response (or §7.3's).
  @Post('key')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() { label }: UpsertApiKeyDto,
  ) {
    return { data: await this.keys.create(user.userId, label) };
  }

  // §7.3 — 201, same shape as create.
  @Post('key/regenerate')
  @HttpCode(HttpStatus.CREATED)
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() { label }: UpsertApiKeyDto,
  ) {
    return { data: await this.keys.regenerate(user.userId, label) };
  }

  // §7.4 — 204, idempotent.
  @Delete('key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.keys.revoke(user.userId);
  }

  @Get('usage')
  async usage(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.keys.usage(user.userId) };
  }
}

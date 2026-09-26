import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeveloperKeysController } from './developer-keys.controller';
import { DeveloperKeysService } from './developer-keys.service';

// docs/plans/developer-api.md, ADR 0010 — key management (register / view /
// regenerate / revoke) for PR 4's public API. RateLimitCounter comes from
// RedisModule, which is @Global(), so it needs no import here.
@Module({
  imports: [AuthModule],
  controllers: [DeveloperKeysController],
  providers: [DeveloperKeysService],
})
export class DeveloperApiModule {}

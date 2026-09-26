import { Module } from '@nestjs/common';
import { ApiKeyCacheModule } from '../api-key-cache/api-key-cache.module';
import { AuthModule } from '../auth/auth.module';
import { DeveloperKeysController } from './developer-keys.controller';
import { DeveloperKeysService } from './developer-keys.service';

// docs/plans/developer-api.md, ADR 0010 — key management (register / view /
// regenerate / revoke) for PR 4's public API. RateLimitCounter comes from
// RedisModule, which is @Global(), so it needs no import here. ApiKeyCache is
// shared with PublicApiModule via ApiKeyCacheModule so revoke()/regenerate()
// can invalidate the entry ApiKeyGuard cached, without either module
// importing the other.
@Module({
  imports: [AuthModule, ApiKeyCacheModule],
  controllers: [DeveloperKeysController],
  providers: [DeveloperKeysService],
})
export class DeveloperApiModule {}

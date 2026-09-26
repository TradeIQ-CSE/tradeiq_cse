import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyCacheModule } from '../api-key-cache/api-key-cache.module';
import { Security } from '../entities/security.entity';
import { Sector } from '../entities/sector.entity';
import { IndicesModule } from '../indices/indices.module';
import { SecuritiesModule } from '../securities/securities.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyUsageRecorder } from './api-key-usage-recorder.service';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { PublicEodController } from './public-eod.controller';
import { PublicEodService } from './public-eod.service';
import { PublicIndicesController } from './public-indices.controller';
import { PublicIndicesService } from './public-indices.service';
import { PublicSecuritiesController } from './public-securities.controller';
import { PublicSecuritiesService } from './public-securities.service';

// docs/api/public-api-v1.md, docs/plans/developer-api.md "Build" step 4 — the
// six public read-only resources. ApiKeyGuard and RateLimitInterceptor are
// applied per controller (@UseGuards/@UseInterceptors), not globally, so this
// module's auth policy stays visible from the controllers themselves — the
// same convention JwtAuthGuard already follows for the authenticated routes.
//
// RateLimitCounter comes from the @Global() RedisModule; ApiKeyCache comes
// from ApiKeyCacheModule, shared with DeveloperApiModule without either
// importing the other.
@Module({
  imports: [
    TypeOrmModule.forFeature([Security, Sector]),
    SecuritiesModule,
    IndicesModule,
    ApiKeyCacheModule,
  ],
  controllers: [
    PublicSecuritiesController,
    PublicIndicesController,
    PublicEodController,
  ],
  providers: [
    ApiKeyGuard,
    RateLimitInterceptor,
    ApiKeyUsageRecorder,
    PublicSecuritiesService,
    PublicIndicesService,
    PublicEodService,
  ],
})
export class PublicApiModule {}

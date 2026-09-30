import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PublicSecuritiesController } from '../public-securities.controller';
import { PublicIndicesController } from '../public-indices.controller';
import { PublicEodController } from '../public-eod.controller';
import { PublicSecuritiesService } from '../public-securities.service';
import { PublicIndicesService } from '../public-indices.service';
import { PublicEodService } from '../public-eod.service';
import { ApiKeyGuard } from '../api-key.guard';
import { RateLimitInterceptor } from '../rate-limit.interceptor';
import {
  canonicalPublicApiDocument,
  createPublicApiDocument,
} from './public-api-docs';

// Reflect actual controllers/DTOs without connecting to a database or Redis.
// The real-app e2e drift assertion ensures this module's route set stays honest.
@Module({
  controllers: [
    PublicSecuritiesController,
    PublicIndicesController,
    PublicEodController,
  ],
  providers: [
    PublicSecuritiesService,
    PublicIndicesService,
    PublicEodService,
  ].map((provide) => ({ provide, useValue: {} })),
})
class ReferenceModule {}

export async function generateReferenceDocument(
  canonical = true,
): Promise<string> {
  const module = await Test.createTestingModule({ imports: [ReferenceModule] })
    .overrideGuard(ApiKeyGuard)
    .useValue({ canActivate: () => true })
    .overrideInterceptor(RateLimitInterceptor)
    .useValue({ intercept: () => undefined })
    .compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const document = createPublicApiDocument(app, [ReferenceModule]);
    return canonical
      ? canonicalPublicApiDocument(document)
      : JSON.stringify(document);
  } finally {
    await app.close();
  }
}

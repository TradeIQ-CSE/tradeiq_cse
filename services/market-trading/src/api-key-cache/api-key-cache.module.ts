import { Module } from '@nestjs/common';
import { ApiKeyCache } from './api-key-cache.service';

// A small shared module so DeveloperApiModule (which invalidates entries on
// revoke/regenerate) and PublicApiModule (which reads and writes them from
// ApiKeyGuard) can both depend on ApiKeyCache without either importing the
// other.
@Module({
  providers: [ApiKeyCache],
  exports: [ApiKeyCache],
})
export class ApiKeyCacheModule {}

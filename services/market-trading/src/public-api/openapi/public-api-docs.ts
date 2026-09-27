import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PublicApiModule } from '../public-api.module';

// docs/api/public-api-v1.md §9 — hosted reference documentation for the six
// public routes, no key required. Called from main.ts (after CORS, so the
// docs routes inherit the public-API CORS policy — they live under /public/,
// which buildCorsOptionsDelegate already matches) and from the e2e suite, so
// a test never exercises a differently-documented app than the one that
// actually serves traffic.
//
// { include: [PublicApiModule] } is what keeps this to exactly the six public
// routes: the internal market routes, ingestion, /developer and /watchlist
// live in other modules and are never scanned.
//
// SwaggerModule.setup() mounts its own routes directly on the underlying
// HTTP adapter rather than through Nest's controller/guard pipeline, so
// ApiKeyGuard and RateLimitInterceptor — both applied per-controller with
// @UseGuards/@UseInterceptors, never globally — never run for /docs or
// /openapi.json; neither needs a key or counts against the rate limit.
export function setupPublicApiDocs(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('TradeIQ public API')
    .setDescription(
      'Read-only Colombo Stock Exchange market data: companies, daily, ' +
        'weekly and monthly prices, indices and end-of-day data. 100 ' +
        'requests per key per hour.',
    )
    .setVersion('1')
    .addServer('https://tradeiqcse.tech/api')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'apiKey')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    include: [PublicApiModule],
  });

  SwaggerModule.setup('public/v1/docs', app, document, {
    jsonDocumentUrl: 'public/v1/openapi.json',
    // No persistAuthorization: the docs are served on the app's own origin,
    // so Swagger UI would otherwise store a pasted API key in that origin's
    // localStorage.
    swaggerOptions: {},
  });
}

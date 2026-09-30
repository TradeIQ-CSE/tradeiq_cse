import { INestApplication, Type } from '@nestjs/common';
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
export function createPublicApiDocument(
  app: INestApplication,
  modules: Type[] = [PublicApiModule],
) {
  const config = new DocumentBuilder()
    .setTitle('TradeIQ public API')
    .setDescription(
      'Read-only Colombo Stock Exchange market data: companies, daily, ' +
        'weekly and monthly prices, indices and end-of-day data. The default ' +
        'quota is 100 requests per key per UTC clock hour; response headers ' +
        'give the limit currently in force. Documentation is key-free.',
    )
    .setVersion('1')
    .addServer(
      process.env.NODE_ENV === 'production' ? '/api' : '/',
      'Same-origin API; local development uses / and production nginx uses /api',
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'apiKey')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    include: modules,
  });
  // OpenAPI3 nullable does not override the non-null type of an allOf ref.
  // Inline only these nullable object USAGES; shared objects remain strict.
  for (const [model, property] of [
    ['PublicSecuritySchema', 'sector'],
    ['PublicIndexSchema', 'latest'],
  ]) {
    const parent = document.components?.schemas?.[
      model
    ] as import('@nestjs/swagger').SchemaObject;
    const usage = parent.properties?.[
      property
    ] as import('@nestjs/swagger').SchemaObject;
    const reference = usage
      .allOf?.[0] as import('@nestjs/swagger').ReferenceObject;
    const shared = document.components?.schemas?.[
      reference.$ref.split('/').pop()!
    ] as import('@nestjs/swagger').SchemaObject;
    parent.properties![property] = { ...shared, ...usage, allOf: undefined };
  }
  return document;
}

/** Stable bundled reference: deployment-specific server prefixes are normalized. */
export function canonicalPublicApiDocument(document: unknown): string {
  const source = JSON.parse(JSON.stringify(document));
  source.servers = [{ url: '/api', description: 'Same-origin production API' }];
  function sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, sort(item)]),
      );
    }
    return value;
  }
  return JSON.stringify(sort(source), null, 2) + '\n';
}

export function setupPublicApiDocs(app: INestApplication): void {
  const document = createPublicApiDocument(app);

  SwaggerModule.setup('public/v1/docs', app, document, {
    jsonDocumentUrl: 'public/v1/openapi.json',
    // No persistAuthorization: the docs are served on the app's own origin,
    // so Swagger UI would otherwise store a pasted API key in that origin's
    // localStorage.
    customSiteTitle: 'TradeIQ API explorer',
    swaggerOptions: { persistAuthorization: false },
  });
}

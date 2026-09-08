import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureMarketTradingApp } from './app.setup';

async function bootstrap() {
  // Install the JSON parser in app.setup with the ingestion contract's 2 MiB
  // limit instead of Express' much smaller default.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  configureMarketTradingApp(app);

  const config = app.get(ConfigService);
  // Public market-data reads are unauthenticated (SRS 3.1.2.2). The backtest
  // routes are not: they are POSTs from the SPA carrying a bearer token, which
  // is why POST is allowed here where GET alone used to be.
  //
  // Request headers are left to reflect what the preflight asks for, as
  // identity-auth does. Enumerating them buys nothing — CORS already governs
  // which origins may send any of them — and an allowlist silently drops the
  // next header a route needs.
  //
  // credentials stays off: the token travels in a header the SPA sets itself,
  // never in a cookie, so the browser has nothing to attach automatically and
  // a cross-site request cannot borrow the user's session.
  app.enableCors({
    origin: config.getOrThrow<string[]>('app.corsOrigins'),
    methods: ['GET', 'POST'],
  });

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}
bootstrap();

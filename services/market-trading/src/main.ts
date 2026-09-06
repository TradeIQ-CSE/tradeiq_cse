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
  // Public market-data reads are unauthenticated (SRS 3.1.2.2), so no
  // credentials are exchanged and the allowlist can stay origin-only.
  app.enableCors({
    origin: config.getOrThrow<string[]>('app.corsOrigins'),
    methods: ['GET'],
  });

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}
bootstrap();

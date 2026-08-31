import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureMarketTradingApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

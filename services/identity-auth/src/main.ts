import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureIdentityAuthApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureIdentityAuthApp(app);

  const config = app.get(ConfigService);
  // credentials: true is what lets the browser send the refresh cookie back on
  // /auth/refresh. It only works against an explicit origin list, never '*'.
  app.enableCors({
    origin: config.getOrThrow<string[]>('app.corsOrigins'),
    credentials: true,
  });

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}
bootstrap();

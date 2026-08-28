import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureIdentityAuthApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureIdentityAuthApp(app);
  const port = app.get(ConfigService).getOrThrow<number>('app.port');
  await app.listen(port);
}
bootstrap();

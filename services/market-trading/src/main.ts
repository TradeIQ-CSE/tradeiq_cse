import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.MARKET_TRADING_PORT ?? 3001;
  await app.listen(port);
}
bootstrap();

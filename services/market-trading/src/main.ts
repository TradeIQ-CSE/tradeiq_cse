import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationFailedException } from './common/errors/api-exception';
import { toValidationFields } from './common/validation/to-validation-fields';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ValidationFailedException(toValidationFields(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

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

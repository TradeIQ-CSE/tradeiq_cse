import { ValidationError } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationFailedException } from './common/errors/api-exception';

// Flattens class-validator's nested error tree into the flat
// error.fields[] shape from docs/api/error-envelope.md.
function toValidationFields(
  errors: ValidationError[],
  parentPath = '',
): { field: string; reason: string }[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.children?.length) {
      return toValidationFields(error.children, path);
    }
    return Object.values(error.constraints ?? {}).map((reason) => ({
      field: path,
      reason,
    }));
  });
}

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

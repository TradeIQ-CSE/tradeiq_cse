import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationFailedException } from './common/errors/api-exception';
import { toValidationFields } from './common/validation/to-validation-fields';

// Cross-cutting HTTP configuration shared by main.ts and the e2e suite, so a
// test can never pass against a differently-configured app than the one that
// actually serves traffic. CORS and the port stay in main.ts: they are
// deployment concerns, not request-pipeline behaviour.
export function configureMarketTradingApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '2mb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ValidationFailedException(toValidationFields(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}

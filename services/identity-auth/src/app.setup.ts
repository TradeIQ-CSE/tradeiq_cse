import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationFailedException } from './common/errors/api-exception';
import { toValidationFields } from './common/validation/to-validation-fields';

export function configureIdentityAuthApp(app: INestApplication): void {
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

import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationFailedException } from './common/errors/api-exception';
import { toValidationFields } from './common/validation/to-validation-fields';

export function configureIdentityAuthApp(app: INestApplication): void {
  // The refresh token travels as an httpOnly cookie (docs/api/auth-v1.md §2.2),
  // so req.cookies has to be populated before any handler reads it.
  app.use(cookieParser());

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

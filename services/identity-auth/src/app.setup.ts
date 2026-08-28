import { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export function configureIdentityAuthApp(app: INestApplication): void {
  app.useGlobalFilters(new AllExceptionsFilter());
}

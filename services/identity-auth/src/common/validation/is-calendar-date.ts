import {
  isISO8601,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A YYYY-MM-DD calendar date, rejecting both a full timestamp and an
// impossible day like 2025-02-30. Mirrors market-trading's copy of the same
// decorator: the services own their own code and share no package (ADR 0001),
// and the `as_of` values validated here are handed straight to that service.
export function IsCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' &&
            DATE_ONLY_PATTERN.test(value) &&
            isISO8601(value, { strict: true, strictSeparator: true })
          );
        },
      },
    });
  };
}

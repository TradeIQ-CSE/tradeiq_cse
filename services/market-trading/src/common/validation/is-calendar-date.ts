import {
  isISO8601,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

import { ValidationError } from 'class-validator';
import { ApiErrorField } from '../errors/api-exception';

// Flattens class-validator's nested error tree into the flat
// error.fields[] shape from docs/api/error-envelope.md.
export function toValidationFields(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorField[] {
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

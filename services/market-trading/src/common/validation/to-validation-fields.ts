import { ValidationError } from 'class-validator';
import { ApiErrorField } from '../errors/api-exception';

// Flattens class-validator's nested error tree into the flat
// error.fields[] shape from docs/api/error-envelope.md.
//
// A node can carry both its own constraints and children — e.g. a property
// that fails @IsObject() while its contents also fail @ValidateNested().
// Both are emitted: dropping either would hide an offending field from the
// envelope, which error-envelope.md §1 requires to list every one.
export function toValidationFields(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorField[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = Object.values(error.constraints ?? {}).map((reason) => ({
      field: path,
      reason,
    }));
    const nested = error.children?.length
      ? toValidationFields(error.children, path)
      : [];
    return [...own, ...nested];
  });
}

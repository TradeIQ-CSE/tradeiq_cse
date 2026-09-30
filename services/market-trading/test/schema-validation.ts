import Ajv, { type AnySchema, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

export function responseValidator(
  document: { components?: unknown },
  schema: unknown,
): ValidateFunction {
  // OpenAPI3 uses nullable plus date/date-time formats; validate those actual
  // constraints rather than only comparing decorator text to itself.
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile({
    ...(schema as object),
    components: document.components,
  } as AnySchema);
}

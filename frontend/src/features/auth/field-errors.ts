import { ApiError } from '../../lib/api';

export interface MappedFieldErrors<Name extends string> {
  /** Ready for antd's `form.setFields`. */
  fields: { name: Name; errors: string[] }[];
  /** Reasons for fields this form does not render, so they are still shown. */
  unmatched: string[];
}

/**
 * Turns a 400 VALIDATION_FAILED into antd `setFields` input.
 *
 * The envelope carries one entry per failed constraint, so a single field can
 * appear more than once — grouping keeps every reason instead of the last one
 * winning. Anything naming a field this form does not render comes back in
 * `unmatched` rather than being dropped, so a server rule we did not
 * anticipate still reaches the user.
 */
export function fieldErrors<Name extends string>(
  error: ApiError,
  known: readonly Name[],
): MappedFieldErrors<Name> {
  const byField = new Map<string, string[]>();
  for (const field of error.body.fields ?? []) {
    const reasons = byField.get(field.field) ?? [];
    reasons.push(field.reason);
    byField.set(field.field, reasons);
  }

  const fields: { name: Name; errors: string[] }[] = [];
  const unmatched: string[] = [];
  for (const [name, errors] of byField) {
    if ((known as readonly string[]).includes(name)) {
      fields.push({ name: name as Name, errors });
    } else {
      unmatched.push(...errors);
    }
  }
  return { fields, unmatched };
}

import { ApiError } from '../../lib/api';

/**
 * The message a portfolio-scoped read failure should show.
 *
 * A VALIDATION_FAILED envelope carries the useful part in `fields[]` — an
 * out-of-range `as_of` answers with the generic "Request validation failed."
 * plus a field reason naming the range that would work ("must fall between
 * 2025-01-02 and 2025-01-10"). Showing only `message` tells the reader nothing
 * they can act on, so the reasons are preferred when they exist.
 */
export function readErrorText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;

  const reasons = error.body.fields?.map((field) => field.reason).filter(Boolean) ?? [];
  return reasons.length > 0 ? reasons.join(' ') : error.body.message;
}

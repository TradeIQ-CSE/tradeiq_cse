import { HttpException, HttpStatus } from '@nestjs/common';

// Error codes from docs/api/error-envelope.md §2 and
// docs/api/paper-trading-v1.md §9.1. Extend this union as new endpoints
// introduce codes from those registries.
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'PORTFOLIO_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

export interface ApiErrorField {
  field: string;
  reason: string;
}

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fields?: ApiErrorField[],
  ) {
    super(message, status);
  }
}

export class UnauthenticatedException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
      'Authentication is required.',
    );
  }
}

export class ValidationFailedException extends ApiException {
  constructor(fields: ApiErrorField[]) {
    super(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Request validation failed.',
      fields,
    );
  }
}

// docs/api/paper-trading-v1.md §9.1 — missing, deleted or other-user
// portfolios are all reported identically so a portfolio id never discloses
// another user's data.
export class PortfolioNotFoundException extends ApiException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found.');
  }
}

// docs/api/paper-trading-v1.md §4 — same idempotency key reused with a
// different canonical request.
export class IdempotencyKeyReusedException extends ApiException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'IDEMPOTENCY_KEY_REUSED',
      'This idempotency key was already used with a different request.',
    );
  }
}

// docs/api/error-envelope.md §2 — a required internal service is temporarily
// unavailable. Distinct from INTERNAL: the caller may safely retry, and
// paper-trading-v1.md §4 relies on that distinction, since a transient
// dependency failure must not consume the request's idempotency key.
export class DependencyUnavailableException extends ApiException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'DEPENDENCY_UNAVAILABLE',
      'A required service is temporarily unavailable.',
    );
  }
}

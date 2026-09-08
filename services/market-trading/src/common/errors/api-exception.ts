import { HttpException, HttpStatus } from '@nestjs/common';

// Error codes from docs/api/error-envelope.md §2. Extend this union as new
// endpoints introduce codes from that registry.
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'SECURITY_NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorField {
  field: string;
  reason: string;
}

// Carries the structured-error-envelope shape (docs/api/error-envelope.md)
// through Nest's exception pipeline; AllExceptionsFilter renders it.
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

export class SecurityNotFoundException extends ApiException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'SECURITY_NOT_FOUND', 'Security not found.');
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

export class IngestionUnavailableException extends ApiException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'DEPENDENCY_UNAVAILABLE',
      'EOD ingestion is not configured.',
    );
  }
}

export class IngestionConflictException extends ApiException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, 'CONFLICT', message);
  }
}

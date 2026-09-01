import { HttpException, HttpStatus } from '@nestjs/common';

// Error codes from docs/api/error-envelope.md §2 and
// docs/api/paper-trading-v1.md §9.1. Extend this union as new endpoints
// introduce codes from those registries.
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_TOKEN_INVALID'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'PORTFOLIO_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'ORDER_NOT_FOUND'
  | 'SECURITY_NOT_FOUND'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_HOLDINGS'
  | 'TRANSACTION_LIMIT_EXCEEDED'
  | 'SECURITY_NOT_TRADABLE'
  | 'PRICE_UNAVAILABLE'
  | 'STALE_PRICE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

// docs/api/paper-trading-v1.md §6.2 — the seven outcomes that a submitted
// order records instead of failing. On POST /orders these are persisted on a
// 201 order with status 'rejected'; on POST /orders/estimate the same
// conditions are error envelopes (§9.1), because there is no order to attach
// them to. Both paths derive from the one checker so they cannot disagree.
export type OrderRejectionCode =
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_HOLDINGS'
  | 'TRANSACTION_LIMIT_EXCEEDED'
  | 'SECURITY_NOT_FOUND'
  | 'SECURITY_NOT_TRADABLE'
  | 'PRICE_UNAVAILABLE'
  | 'STALE_PRICE';

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

// docs/api/auth-v1.md §4.2 — one response for "no such account" and "wrong
// password". Distinguishing them would turn the login endpoint into an oracle
// for which addresses are registered.
export class InvalidCredentialsException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'Email or password is incorrect.',
    );
  }
}

// docs/api/auth-v1.md §4.3 — missing, expired, revoked, unknown and replayed
// refresh tokens are reported identically, so the response never tells a
// caller which of those a token they hold happens to be.
export class RefreshTokenInvalidException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'REFRESH_TOKEN_INVALID',
      'Refresh token is not valid.',
    );
  }
}

// docs/api/auth-v1.md §4.1. This does disclose that an address is registered,
// which signup cannot avoid — it has to say why it refused.
export class EmailAlreadyRegisteredException extends ApiException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'EMAIL_ALREADY_REGISTERED',
      'An account already exists for this email address.',
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

export class OrderNotFoundException extends ApiException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
  }
}

// §9.1 — the estimate endpoint's rendering of a rejection. Unknown symbols are
// 404; every other rejection is 422, a well-formed request refused by a domain
// rule. Order submission never throws these: it persists them (§6.2).
const REJECTION_MESSAGES: Record<OrderRejectionCode, string> = {
  INSUFFICIENT_CASH: 'Portfolio does not have enough cash for this order.',
  INSUFFICIENT_HOLDINGS: 'Portfolio does not hold enough of this security.',
  TRANSACTION_LIMIT_EXCEEDED:
    'Order value exceeds the maximum supported transaction value.',
  SECURITY_NOT_FOUND: 'Security not found.',
  SECURITY_NOT_TRADABLE: 'Security is not currently tradable.',
  PRICE_UNAVAILABLE: 'No usable price is available for this security.',
  STALE_PRICE: 'The latest price for this security is out of date.',
};

export class OrderRejectedException extends ApiException {
  constructor(code: OrderRejectionCode) {
    super(
      code === 'SECURITY_NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : HttpStatus.UNPROCESSABLE_ENTITY,
      code,
      REJECTION_MESSAGES[code],
    );
  }
}

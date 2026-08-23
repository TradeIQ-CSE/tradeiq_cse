export class BacktestError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidRuleError extends BacktestError {
  constructor(
    message: string,
    public readonly fields?: { field: string; reason: string }[],
  ) {
    super(message, 'INVALID_RULE');
  }
}

export class InvalidDateRangeError extends BacktestError {
  constructor(message: string) {
    super(message, 'INVALID_DATE_RANGE');
  }
}

export class MissingPriceHistoryError extends BacktestError {
  constructor(message: string) {
    super(message, 'MISSING_PRICE_HISTORY');
  }
}

export class InsufficientWarmupDataError extends BacktestError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_WARMUP_DATA');
  }
}

export class InvalidBarDataError extends BacktestError {
  constructor(message: string) {
    super(message, 'INVALID_BAR_DATA');
  }
}

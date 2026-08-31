import { HttpException, HttpStatus } from '@nestjs/common';

export class BacktestApiError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        code,
        message,
        ...(details ? { details } : {}),
      },
      status,
    );
  }
}

export function mapEngineError(error: unknown): BacktestApiError {
  const err = error as {
    code?: string;
    message?: string;
    details?: unknown;
    fields?: unknown;
  };
  const code = err?.code;
  const msg = err?.message || 'An unexpected error occurred.';

  switch (code) {
    case 'INVALID_DATE_RANGE':
      return new BacktestApiError('INVALID_DATE_RANGE', msg, err?.details);
    case 'MISSING_PRICE_HISTORY':
      return new BacktestApiError(
        'INSUFFICIENT_PRICE_HISTORY',
        msg,
        err?.details,
      );
    case 'INSUFFICIENT_WARMUP_DATA':
      return new BacktestApiError(
        'INSUFFICIENT_WARMUP_DATA',
        msg,
        err?.details,
      );
    case 'INVALID_BAR_DATA':
      return new BacktestApiError('INVALID_REQUEST', msg, err?.details);
    case 'INVALID_RULE':
      return new BacktestApiError(
        'INVALID_RULE_CONFIGURATION',
        msg,
        err?.fields,
      );
    default:
      return new BacktestApiError(
        'BACKTEST_EXECUTION_FAILED',
        'The backtest could not be completed.',
      );
  }
}

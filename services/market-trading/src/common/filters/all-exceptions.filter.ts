import * as crypto from 'crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorCode, ApiException } from '../errors/api-exception';
import { BacktestApiError } from '../../backtest-runs/errors/backtest-api-error';

// Renders every non-2xx response as the structured envelope in
// docs/api/error-envelope.md. Unknown errors never leak internals — they
// collapse to a generic 500 INTERNAL body; diagnosis happens via trace_id
// in the server logs.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const traceId = crypto.randomUUID();

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = 'INTERNAL';
    let message = 'An unexpected error occurred.';
    let fields: { field: string; reason: string }[] | undefined;

    if (exception instanceof BacktestApiError) {
      status = exception.getStatus();
      code = exception.code as ApiErrorCode;
      message = exception.message;
    } else if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'INTERNAL';
      message =
        status < HttpStatus.INTERNAL_SERVER_ERROR ? exception.message : message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception [trace_id=${traceId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      code = 'INTERNAL';
      message = 'An unexpected error occurred.';
      fields = undefined;
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
        trace_id: traceId,
      },
    });
  }
}

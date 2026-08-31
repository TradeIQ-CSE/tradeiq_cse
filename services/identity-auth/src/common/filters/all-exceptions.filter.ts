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
import {
  ApiErrorCode,
  ApiErrorField,
  ApiException,
} from '../errors/api-exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const traceId = crypto.randomUUID();

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = 'INTERNAL';
    let message = 'An unexpected error occurred.';
    let fields: ApiErrorField[] | undefined;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = exception.message;
      }
    } else {
      this.logger.error(
        `Unhandled exception [trace_id=${traceId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
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

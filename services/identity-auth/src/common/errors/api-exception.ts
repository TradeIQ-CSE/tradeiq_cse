import { HttpException, HttpStatus } from '@nestjs/common';

export type ApiErrorCode = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'INTERNAL';

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ApiErrorCode,
    message: string,
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

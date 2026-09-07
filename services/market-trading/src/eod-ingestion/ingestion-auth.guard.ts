import { timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IngestionUnauthenticatedException,
  IngestionUnavailableException,
} from '../common/errors/api-exception';

@Injectable()
export class IngestionAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ingestion.token') ?? '';
    if (!expected) throw new IngestionUnavailableException();

    const header = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>()
      .headers.authorization;
    const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (
      expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)
    ) {
      throw new IngestionUnauthenticatedException();
    }
    return true;
  }
}

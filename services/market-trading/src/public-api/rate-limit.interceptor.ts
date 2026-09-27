import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { RateLimitedException } from '../common/errors/api-exception';
import { currentWindow } from '../developer-api/rate-limit-window';
import { RateLimitCounter } from '../redis/rate-limit-counter';
import { ApiKeyAuthenticatedRequest } from './api-key.guard';

// docs/api/public-api-v1.md §3 — the per-key hourly limit, applied to the
// public controllers only (never the JWT-authenticated /developer routes).
// Runs after ApiKeyGuard (Nest runs guards before interceptors), so
// request.apiKey is always set by the time this executes.
//
// Headers are set before the handler runs (and before a 429 is thrown) so
// they land on every response the guard let through, 2xx and 4xx alike.
const ONE_MINUTE_MS = 60_000;

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);
  private lastWarnAtMs = 0;

  constructor(
    private readonly counter: RateLimitCounter,
    private readonly config: ConfigService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<ApiKeyAuthenticatedRequest>();
    const response = httpContext.getResponse<Response>();

    const limit = this.config.getOrThrow<number>('publicApi.hourlyLimit');
    const now = new Date();
    const window = currentWindow(now);
    const apiKeyId = request.apiKey?.apiKeyId;

    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Reset', toRfc3339Seconds(window.resetAt));

    // Should always be set — ApiKeyGuard runs first and throws otherwise —
    // but a defensive check keeps this interceptor from ever throwing on a
    // request the guard did not, in fact, resolve a key for.
    if (!apiKeyId) {
      return next.handle();
    }

    let count: number;
    try {
      count = await this.counter.increment(
        window.counterKey(apiKeyId),
        window.ttlSeconds,
      );
    } catch (err) {
      // ADR 0010 fail-open: a request the limiter can't check is still
      // served. X-RateLimit-Remaining is omitted because it cannot honestly
      // be stated; Limit and Reset are still meaningful without the counter.
      this.warnThrottled(err);
      return next.handle();
    }

    const remaining = Math.max(0, limit - count);
    response.setHeader('X-RateLimit-Remaining', String(remaining));

    if (count > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((window.resetAt.getTime() - now.getTime()) / 1000),
      );
      response.setHeader('Retry-After', String(retryAfterSeconds));
      throw new RateLimitedException(toRfc3339Seconds(window.resetAt));
    }

    return next.handle();
  }

  // At most one log line per minute: a Redis outage would otherwise log once
  // per request for as long as it lasts.
  private warnThrottled(err: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAtMs < ONE_MINUTE_MS) return;
    this.lastWarnAtMs = now;
    this.logger.warn(
      `Rate limit counter unavailable, serving request without a limit check: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// RFC 3339 UTC with no fractional seconds — the same format
// developer-keys.service.ts uses for reset_at, so the header and the 429
// body's reset_at can never disagree.
function toRfc3339Seconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

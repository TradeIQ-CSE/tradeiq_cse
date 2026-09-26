import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { RateLimitedException } from '../common/errors/api-exception';
import { InMemoryRateLimitCounter } from '../redis/in-memory-rate-limit-counter';
import { ApiKeyAuthenticatedRequest } from './api-key.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';

function contextWithApiKey(apiKeyId: string | undefined) {
  const headers: Record<string, string> = {};
  const setHeader = jest.fn((name: string, value: string) => {
    headers[name] = value;
  });
  const request: Partial<ApiKeyAuthenticatedRequest> = apiKeyId
    ? { apiKey: { apiKeyId } }
    : {};
  const response = { setHeader };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, headers, setHeader };
}

function configWithLimit(limit: number): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue(limit),
  } as unknown as ConfigService;
}

const NEXT: CallHandler = { handle: () => of('handled') };

describe('RateLimitInterceptor', () => {
  const fixedNow = new Date('2026-09-26T09:15:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets the three headers on success', async () => {
    const counter = new InMemoryRateLimitCounter(() => fixedNow.getTime());
    const interceptor = new RateLimitInterceptor(counter, configWithLimit(5));
    const { context, headers } = contextWithApiKey('key-1');

    const result = await interceptor.intercept(context, NEXT);
    expect(await firstValue(result)).toBe('handled');

    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Remaining']).toBe('4');
    expect(headers['X-RateLimit-Reset']).toBe('2026-09-26T10:00:00Z');
  });

  it('decrements Remaining across successive requests for the same key', async () => {
    const counter = new InMemoryRateLimitCounter(() => fixedNow.getTime());
    const interceptor = new RateLimitInterceptor(counter, configWithLimit(3));

    const first = contextWithApiKey('key-1');
    await interceptor.intercept(first.context, NEXT);
    expect(first.headers['X-RateLimit-Remaining']).toBe('2');

    const second = contextWithApiKey('key-1');
    await interceptor.intercept(second.context, NEXT);
    expect(second.headers['X-RateLimit-Remaining']).toBe('1');
  });

  it('answers 429 with reset_at and Retry-After once the count exceeds the limit', async () => {
    const counter = new InMemoryRateLimitCounter(() => fixedNow.getTime());
    const interceptor = new RateLimitInterceptor(counter, configWithLimit(1));

    const first = contextWithApiKey('key-1');
    await interceptor.intercept(first.context, NEXT);

    const second = contextWithApiKey('key-1');
    await expect(interceptor.intercept(second.context, NEXT)).rejects.toThrow(
      RateLimitedException,
    );

    try {
      await interceptor.intercept(contextWithApiKey('key-1').context, NEXT);
      fail('expected a RateLimitedException');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedException);
      expect((err as RateLimitedException).resetAt).toBe(
        '2026-09-26T10:00:00Z',
      );
    }

    expect(second.headers['Retry-After']).toBe('2700'); // 45 minutes
    expect(second.headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('Retry-After is at least 1 and rounded up', async () => {
    jest.setSystemTime(new Date('2026-09-26T09:59:59.500Z'));
    const counter = new InMemoryRateLimitCounter(() => Date.now());
    const interceptor = new RateLimitInterceptor(counter, configWithLimit(0));

    const { context, headers } = contextWithApiKey('key-1');
    await expect(interceptor.intercept(context, NEXT)).rejects.toThrow(
      RateLimitedException,
    );
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
  });

  it('a throwing counter lets the request through without Remaining, and logs a warning, throttled to once a minute', async () => {
    const failingCounter = {
      increment: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      peek: jest.fn(),
    };
    const interceptor = new RateLimitInterceptor(
      failingCounter,
      configWithLimit(5),
    );
    const warnSpy = jest
      .spyOn(
        (interceptor as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    const { context, headers } = contextWithApiKey('key-1');
    const result = await interceptor.intercept(context, NEXT);
    expect(await firstValue(result)).toBe('handled');

    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
    expect(headers['X-RateLimit-Remaining']).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // A second failure within the same minute must not log again.
    const second = contextWithApiKey('key-1');
    await interceptor.intercept(second.context, NEXT);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Advancing past a minute allows the next failure to log again.
    jest.advanceTimersByTime(61_000);
    const third = contextWithApiKey('key-1');
    await interceptor.intercept(third.context, NEXT);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('passes through harmlessly if request.apiKey is somehow unset', async () => {
    const counter = new InMemoryRateLimitCounter(() => fixedNow.getTime());
    const interceptor = new RateLimitInterceptor(counter, configWithLimit(5));
    const { context, headers } = contextWithApiKey(undefined);

    const result = await interceptor.intercept(context, NEXT);
    expect(await firstValue(result)).toBe('handled');
    expect(headers['X-RateLimit-Remaining']).toBeUndefined();
  });
});

function firstValue<T>(observable: import('rxjs').Observable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}

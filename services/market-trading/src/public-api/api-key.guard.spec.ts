import { ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiKeyCache } from '../api-key-cache/api-key-cache.service';
import { InvalidApiKeyException } from '../common/errors/api-exception';
import { hashApiKey } from '../developer-api/api-key';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyUsageRecorder } from './api-key-usage-recorder.service';

const VALID_KEY = `tiq_${'a'.repeat(40)}`;

function contextWith(headers: Record<string, string | string[] | undefined>) {
  const request: Record<string, unknown> = { headers, query: {} };
  const onHandlers: Record<string, () => void> = {};
  const response = {
    on: jest.fn((event: string, handler: () => void) => {
      onHandlers[event] = handler;
    }),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return {
    context,
    request,
    response,
    fireFinish: () => onHandlers.finish?.(),
  };
}

describe('ApiKeyGuard', () => {
  let query: jest.Mock;
  let cache: ApiKeyCache;
  let record: jest.Mock;
  let guard: ApiKeyGuard;

  beforeEach(() => {
    query = jest.fn();
    cache = new ApiKeyCache();
    record = jest.fn();
    guard = new ApiKeyGuard({ query } as unknown as DataSource, cache, {
      record,
    } as unknown as ApiKeyUsageRecorder);
  });

  it('rejects a missing header', async () => {
    const { context } = contextWith({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      InvalidApiKeyException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a malformed key without querying the database', async () => {
    const { context } = contextWith({ 'x-api-key': 'not-a-real-key' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      InvalidApiKeyException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown (well-formed but not found) key', async () => {
    query.mockResolvedValue([]);
    const { context } = contextWith({ 'x-api-key': VALID_KEY });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      InvalidApiKeyException,
    );
  });

  it('rejects a revoked key the same way (the query excludes revoked_at rows)', async () => {
    query.mockResolvedValue([]); // revoked_at IS NULL filters it out server-side
    const { context } = contextWith({ 'x-api-key': VALID_KEY });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      InvalidApiKeyException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'A valid API key is required',
    );
  });

  it('never reads the key from the query string', async () => {
    const request: Record<string, unknown> = {
      headers: {},
      query: { api_key: VALID_KEY, 'X-API-Key': VALID_KEY },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ on: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      InvalidApiKeyException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('every failure carries the exact same message', async () => {
    const cases = [{}, { 'x-api-key': 'bad' }];
    for (const headers of cases) {
      const { context } = contextWith(headers);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'A valid API key is required',
      );
    }
  });

  it('accepts a well-formed, active key and attaches { apiKeyId } to the request', async () => {
    query.mockResolvedValue([{ api_key_id: 'key-id-1' }]);
    const { context, request } = contextWith({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as { apiKey?: { apiKeyId: string } }).apiKey).toEqual({
      apiKeyId: 'key-id-1',
    });
  });

  it('registers a finish listener that records usage for the resolved key', async () => {
    query.mockResolvedValue([{ api_key_id: 'key-id-1' }]);
    const { context, fireFinish } = contextWith({ 'x-api-key': VALID_KEY });

    await guard.canActivate(context);
    fireFinish();

    expect(record).toHaveBeenCalledWith('key-id-1');
  });

  it('a cache hit skips the database entirely', async () => {
    cache.set(hashApiKey(VALID_KEY), 'cached-key-id');
    const { context, request } = contextWith({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
    expect((request as { apiKey?: { apiKeyId: string } }).apiKey).toEqual({
      apiKeyId: 'cached-key-id',
    });
  });

  it('caches a fresh DB hit so a subsequent request skips the database', async () => {
    query.mockResolvedValue([{ api_key_id: 'key-id-1' }]);
    const first = contextWith({ 'x-api-key': VALID_KEY });
    await guard.canActivate(first.context);
    expect(query).toHaveBeenCalledTimes(1);

    const second = contextWith({ 'x-api-key': VALID_KEY });
    await guard.canActivate(second.context);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces the next lookup back to the database', async () => {
    query.mockResolvedValue([{ api_key_id: 'key-id-1' }]);
    const first = contextWith({ 'x-api-key': VALID_KEY });
    await guard.canActivate(first.context);
    expect(query).toHaveBeenCalledTimes(1);

    cache.invalidate(hashApiKey(VALID_KEY));

    query.mockResolvedValue([]); // now revoked
    const second = contextWith({ 'x-api-key': VALID_KEY });
    await expect(guard.canActivate(second.context)).rejects.toBeInstanceOf(
      InvalidApiKeyException,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});

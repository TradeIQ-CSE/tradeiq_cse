import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ApiKeyUsageRecorder } from './api-key-usage-recorder.service';

// A tick to let record()'s fire-and-forget promise chain settle before a test
// inspects the mock, since record() never returns a promise the test itself
// could await.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ApiKeyUsageRecorder', () => {
  let recorder: ApiKeyUsageRecorder;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyUsageRecorder,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();

    recorder = module.get(ApiKeyUsageRecorder);
  });

  it('upserts today’s usage row and refreshes last_used_at', async () => {
    recorder.record('key-1');
    await flushMicrotasks();

    expect(query).toHaveBeenCalledTimes(2);

    const [upsertSql, upsertParams] = query.mock.calls[0];
    expect(upsertSql).toContain('INSERT INTO market_data.api_key_usage');
    expect(upsertSql).toContain('ON CONFLICT (api_key_id, usage_date)');
    expect(upsertSql).toContain(
      'request_count = market_data.api_key_usage.request_count + 1',
    );
    expect(upsertParams[0]).toBe('key-1');
    expect(upsertParams[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const [lastUsedSql, lastUsedParams] = query.mock.calls[1];
    expect(lastUsedSql).toContain('UPDATE market_data.api_keys');
    expect(lastUsedSql).toContain('SET last_used_at = now()');
    expect(lastUsedSql).toContain("interval '1 minute'");
    expect(lastUsedParams).toEqual(['key-1']);
  });

  it('does not throw when record() is called synchronously and the write fails', async () => {
    query.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(() => recorder.record('key-1')).not.toThrow();
    await flushMicrotasks();
  });

  it('logs a warning rather than throwing on a failed write', async () => {
    query.mockRejectedValue(new Error('boom'));
    const warnSpy = jest
      .spyOn(
        (recorder as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    recorder.record('key-1');
    await flushMicrotasks();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('key-1'));
  });
});

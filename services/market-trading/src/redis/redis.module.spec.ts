import { RedisModule } from './redis.module';

describe('RedisModule', () => {
  it('quits the client on destroy', async () => {
    const client = {
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const module = new RedisModule(client as never);

    await module.onModuleDestroy();

    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('falls back to disconnect when quit rejects (Redis unreachable)', async () => {
    const client = {
      quit: jest.fn().mockRejectedValue(new Error('not connected')),
      disconnect: jest.fn(),
    };
    const module = new RedisModule(client as never);

    await module.onModuleDestroy();

    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});

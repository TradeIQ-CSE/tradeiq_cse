import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  hostPortOf,
  logConnectionEventsThrottled,
} from './redis-connection-logging';

describe('logConnectionEventsThrottled', () => {
  function fakeLogger() {
    return { error: jest.fn(), log: jest.fn() } as unknown as Logger;
  }

  it('logs the first error', () => {
    const client = new EventEmitter();
    const logger = fakeLogger();
    logConnectionEventsThrottled(client, logger, 'redis:6379');

    client.emit('error', new Error('ECONNREFUSED'));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('redis:6379'),
    );
  });

  it('does not log repeated errors while still failing', () => {
    const client = new EventEmitter();
    const logger = fakeLogger();
    logConnectionEventsThrottled(client, logger, 'redis:6379');

    client.emit('error', new Error('ECONNREFUSED'));
    client.emit('error', new Error('ECONNREFUSED'));
    client.emit('error', new Error('ECONNREFUSED'));

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs recovery only after a prior error, once', () => {
    const client = new EventEmitter();
    const logger = fakeLogger();
    logConnectionEventsThrottled(client, logger, 'redis:6379');

    client.emit('ready'); // never failed — nothing to recover from
    expect(logger.log).not.toHaveBeenCalled();

    client.emit('error', new Error('ECONNREFUSED'));
    client.emit('ready');
    client.emit('ready'); // still-healthy readies after the first don't repeat

    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('logs a fresh error again after a recovery in between', () => {
    const client = new EventEmitter();
    const logger = fakeLogger();
    logConnectionEventsThrottled(client, logger, 'redis:6379');

    client.emit('error', new Error('first'));
    client.emit('ready');
    client.emit('error', new Error('second'));

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});

describe('hostPortOf', () => {
  it('extracts host and port, never a password', () => {
    expect(hostPortOf('redis://user:supersecret@myhost:6380')).toBe(
      'myhost:6380',
    );
  });

  it('defaults the port to 6379 when absent', () => {
    expect(hostPortOf('redis://redis')).toBe('redis:6379');
  });

  it('falls back to a safe placeholder for an unparsable value', () => {
    expect(hostPortOf('not a url')).toBe('redis');
  });
});

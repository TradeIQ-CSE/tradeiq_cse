import { Logger } from '@nestjs/common';

// ioredis keeps retrying forever with its default auto-reconnect; logging
// every attempt would flood the log for as long as Redis stays down. Only the
// transition into failure and the transition back out of it are worth a line.
export interface ErrorEmitter {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'ready', listener: () => void): unknown;
}

export function logConnectionEventsThrottled(
  client: ErrorEmitter,
  logger: Logger,
  hostPort: string,
): void {
  let failing = false;

  client.on('error', (err: Error) => {
    if (failing) return;
    failing = true;
    logger.error(`Redis connection error (${hostPort}): ${err.message}`);
  });

  client.on('ready', () => {
    if (!failing) return;
    failing = false;
    logger.log(`Redis connection recovered (${hostPort})`);
  });
}

// Host and port only — a URL can carry a password (redis://user:pass@host),
// and this is the one place that URL is allowed to be logged. Falls back to a
// safe placeholder rather than risk printing something unparsed and
// potentially secret.
export function hostPortOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '6379'}`;
  } catch {
    return 'redis';
  }
}

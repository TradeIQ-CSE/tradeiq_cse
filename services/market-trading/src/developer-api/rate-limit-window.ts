// docs/plans/developer-api.md "Hour window helper" — shared by this PR's
// usage view and PR 4's rate limiter, so the two can never disagree about
// which UTC clock hour a request falls in or when it resets. ADR 0010: a
// fixed clock-hour window, not a sliding one, is what makes a single
// `reset_at` value meaningful.
export interface RateLimitWindow {
  // `ratelimit:{apiKeyId}:{yyyymmddhh}`, UTC. The Redis key
  // RateLimitCounter.increment/peek operate on for this key in this hour.
  counterKey(apiKeyId: string): string;
  // The start of the next UTC hour — the instant the count resets.
  resetAt: Date;
  // The expiry for the counter key: seconds until resetAt, plus 60 s grace.
  ttlSeconds: number;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function currentWindow(now: Date): RateLimitWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const hour = now.getUTCHours();

  const stamp = `${year}${pad(month + 1)}${pad(day)}${pad(hour)}`;
  // Date.UTC rolls month/day/hour overflow into the next unit itself (hour
  // 23 + 1 becomes hour 0 the next day, day 31 + 1 becomes the 1st of the
  // next month, and so on), so no separate month/year-end handling is needed.
  const resetAt = new Date(Date.UTC(year, month, day, hour + 1, 0, 0, 0));
  const msUntilReset = resetAt.getTime() - now.getTime();
  // Ceil (not round) plus a fixed 60 s grace so ttlSeconds is never 0 or so
  // small that EXPIRE races the next request in the same hour — the key name
  // carries the hour stamp, so the grace can't leak counts into the next hour.
  const ttlSeconds = Math.ceil(msUntilReset / 1000) + 60;

  return {
    counterKey: (apiKeyId: string) => `ratelimit:${apiKeyId}:${stamp}`,
    resetAt,
    ttlSeconds,
  };
}

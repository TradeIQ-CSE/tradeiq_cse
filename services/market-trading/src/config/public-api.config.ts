import { registerAs } from '@nestjs/config';

// The public developer API's hourly per-key rate limit (SRS 3.1.3.3, 3.5.4).
// Defaulted here rather than required in env.validation.ts: unlike REDIS_URL,
// an absent value has a sensible, documented fallback rather than a failure
// mode worth catching at boot.
const DEFAULT_HOURLY_LIMIT = 100;

export default registerAs('publicApi', () => ({
  hourlyLimit: process.env.PUBLIC_API_HOURLY_LIMIT
    ? parseInt(process.env.PUBLIC_API_HOURLY_LIMIT, 10)
    : DEFAULT_HOURLY_LIMIT,
}));

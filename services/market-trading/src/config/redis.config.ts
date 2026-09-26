import { registerAs } from '@nestjs/config';

// Redis backs the hourly per-key rate-limit counters (SRS 3.6.1,
// docs/adr/0010-public-developer-api.md). A Redis outage must not take the
// public API down (fail open), but a misconfigured URL should — hence
// required in env.validation.ts rather than defaulted here.
export default registerAs('redis', () => ({
  url: process.env.REDIS_URL,
}));

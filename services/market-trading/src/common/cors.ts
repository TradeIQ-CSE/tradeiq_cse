// docs/api/public-api-v1.md §4 — the public developer API is the one part of
// this service that must answer any origin, because the key travels in a
// header rather than a cookie: there is nothing on that surface for another
// site's script to borrow. Every other route keeps today's behaviour (the
// configured SPA origins; GET, POST and DELETE).
//
// A delegate rather than a single static options object because the two
// policies are genuinely different (origin `*` vs. a fixed list; GET-only vs.
// GET/POST/DELETE); picking per request is what nest's `enableCors(delegate)`
// exists for.

export interface CorsOptionsLike {
  origin: boolean | string | string[];
  methods: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
}

export type CorsRequestLike = { url?: string; path?: string };

export type CorsOptionsCallback = (
  err: Error | null,
  options: CorsOptionsLike,
) => void;

export type CorsOptionsDelegate = (
  req: CorsRequestLike,
  callback: CorsOptionsCallback,
) => void;

const PUBLIC_API_PATH_PREFIX = '/public/';

// The headers a public-API response carries that a cross-origin script needs
// explicit permission to read (docs/api/public-api-v1.md §4); Retry-After is
// included because a 429 exposes it too.
const PUBLIC_API_EXPOSED_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Retry-After',
];

function requestPath(req: CorsRequestLike): string {
  return req.path ?? req.url ?? '';
}

export function buildCorsOptionsDelegate(
  corsOrigins: string[],
): CorsOptionsDelegate {
  return (req, callback) => {
    if (requestPath(req).startsWith(PUBLIC_API_PATH_PREFIX)) {
      callback(null, {
        origin: '*',
        methods: ['GET'],
        allowedHeaders: ['X-API-Key'],
        exposedHeaders: PUBLIC_API_EXPOSED_HEADERS,
      });
      return;
    }

    callback(null, {
      origin: corsOrigins,
      methods: ['GET', 'POST', 'DELETE'],
    });
  };
}

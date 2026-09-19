/**
 * Join an API base origin with a request path.
 *
 * `new URL('/securities', 'https://host/api/market')` resolves to
 * `https://host/securities`: a path beginning with a slash replaces the base's
 * own path rather than extending it. That is correct per the URL spec and
 * invisible in development, where the base is `http://localhost:3001` and has
 * no path to lose — but in a deployment that serves the API under a prefix it
 * silently drops the prefix, and every request lands on the frontend instead.
 *
 * Concatenating means the base's path is always kept, whether or not it has
 * one, and whether or not either side carries a slash at the join.
 */
export function apiUrl(base: string, path: string): URL {
  return new URL(`${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
}

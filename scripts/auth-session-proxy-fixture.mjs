// Cookie routing fixture only: exercises the real nginx configuration over TLS.
// No database, real account, credentials, or external service is involved.
import http from 'node:http';
let token = 0;
const sessions = new Set();
const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
};
const cookie = (value, maxAge = 900) => `refresh_token=${value}; Path=/auth; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
http.createServer((request, response) => {
  const presented = request.headers.cookie?.match(/(?:^|;\s*)refresh_token=([^;]*)/)?.[1];
  if (request.method === 'POST' && ['/auth/login', '/auth/signup'].includes(request.url)) {
    const next = `fixture-${++token}`;
    sessions.add(next);
    return json(response, 200, { authenticated: true }, { 'Set-Cookie': cookie(next) });
  }
  if (request.method === 'POST' && request.url === '/auth/refresh') {
    if (!sessions.delete(presented)) return json(response, 401, { authenticated: false });
    const next = `fixture-${++token}`;
    sessions.add(next);
    return json(response, 200, { authenticated: true }, { 'Set-Cookie': cookie(next) });
  }
  if (request.method === 'POST' && request.url === '/auth/logout') {
    sessions.delete(presented);
    return json(response, 200, { authenticated: false }, { 'Set-Cookie': cookie('', 0) });
  }
  return json(response, 404, { error: 'wrong upstream path' });
}).listen(3002, '0.0.0.0');
// A wrongly widened cookie scope is rejected instead of silently accepted.
for (const port of [3001, 5173]) {
  http.createServer((request, response) => {
    json(response, request.headers.cookie?.includes('refresh_token=') ? 400 : 200, { cookieLeaked: Boolean(request.headers.cookie?.includes('refresh_token=')) });
  }).listen(port, '0.0.0.0');
}

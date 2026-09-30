// Isolated routing fixtures: no database, Redis, credentials, or production calls.
import http from 'node:http';
import { readFileSync } from 'node:fs';
const spec = readFileSync('frontend/src/features/developer-api/generated/public-api.json');
const docs = '<!doctype html><html><head><link href="./docs/swagger-ui.css" rel="stylesheet"></head><body><div id="swagger-ui"></div><script src="./docs/swagger-ui-bundle.js"></script><script src="./docs/swagger-ui-init.js"></script></body></html>';
http.createServer((request, response) => {
  const routes = {
    '/public/v1/docs': [200, 'text/html', docs],
    '/public/v1/openapi.json': [200, 'application/json', spec],
    '/public/v1/docs/swagger-ui.css': [200, 'text/css', '.swagger-ui { display: block; }'],
    '/public/v1/docs/swagger-ui-bundle.js': [200, 'application/javascript', 'window.SwaggerUIBundle = function() {};'],
    '/public/v1/docs/swagger-ui-init.js': [200, 'application/javascript', 'window.onload = function() {};'],
    '/public/v1/securities': [401, 'application/json', JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'A valid API key is required', trace_id: 'test-only' } })],
  };
  const [status, type, body] = routes[request.url] ?? [404, 'application/json', '{"error":{"code":"NOT_FOUND"}}'];
  response.writeHead(status, { 'Content-Type': type }); response.end(body);
}).listen(3001, '0.0.0.0');
http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html><body>SPA fallback</body></html>');
}).listen(5173, '0.0.0.0');

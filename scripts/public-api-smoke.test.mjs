import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicApi } from './public-api-smoke.mjs';

test('rejects a frontend HTML 200 served as API docs', async () => {
  await assert.rejects(checkPublicApi('https://example.test/api/public/v1', async () => new Response('<!doctype html><html>frontend</html>', { headers: { 'Content-Type': 'text/html' } })), /Swagger HTML/);
});
test('rejects frontend HTML masquerading as a successful OpenAPI document', async () => {
  await assert.rejects(checkPublicApi('https://example.test/api/public/v1', async (url) => String(url).endsWith('/docs') ? new Response('swagger-ui', { headers: { 'Content-Type': 'text/html' } }) : new Response('<html>frontend</html>', { headers: { 'Content-Type': 'text/html' } })), /OpenAPI must return JSON/);
});

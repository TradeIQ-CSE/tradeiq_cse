#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const EXPECTED_PATHS = [
  '/public/v1/securities', '/public/v1/securities/{symbol}',
  '/public/v1/securities/{symbol}/ohlcv', '/public/v1/indices',
  '/public/v1/indices/{code}/values', '/public/v1/eod',
].sort();

export async function checkPublicApi(baseUrl, fetcher = fetch) {
  async function get(path) {
    const response = await fetcher(`${baseUrl.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(10000) });
    const body = await response.text();
    const type = response.headers.get('content-type') ?? '';
    return { response, body, type };
  }
  const docs = await get('/docs');
  if (docs.response.status !== 200 || !docs.type.includes('text/html') || !docs.body.includes('swagger-ui')) throw new Error('Public docs must return Swagger HTML, not the frontend');
  const spec = await get('/openapi.json');
  if (spec.response.status !== 200 || !spec.type.includes('application/json')) throw new Error('OpenAPI must return JSON, not the frontend');
  const document = JSON.parse(spec.body);
  if (!document.openapi?.startsWith('3.') || JSON.stringify(Object.keys(document.paths ?? {}).sort()) !== JSON.stringify(EXPECTED_PATHS)) throw new Error('OpenAPI must contain exactly the six external resources');
  const resources = await get('/securities');
  if (resources.response.status !== 401 || !resources.type.includes('application/json') || JSON.parse(resources.body).error?.code !== 'UNAUTHENTICATED') throw new Error('Key-free resource read must return JSON 401, not frontend HTML');
  const assets = [...docs.body.matchAll(/(?:src|href)="([^"]*swagger-ui[^"?]*\.(?:js|css))"/g)].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith('swagger-ui-init.js')) || !assets.some((asset) => asset.endsWith('.css'))) throw new Error('Swagger asset links are missing');
  for (const asset of assets) {
    const url = new URL(asset, `${baseUrl.replace(/\/$/, '')}/docs`);
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
    const type = response.headers.get('content-type') ?? '';
    const body = await response.text();
    if (response.status !== 200 || !(asset.endsWith('.css') ? type.includes('text/css') : /(?:javascript|ecmascript)/.test(type)) || /^\s*<!doctype html/i.test(body)) throw new Error(`Wrong Swagger asset response: ${asset}`);
  }
}

if (!process.argv[1] || import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] ?? process.env.PUBLIC_API_SMOKE_URL ?? 'https://tradeiqcse.tech/api/public/v1';
  let failure;
  for (let attempt = 0; attempt < 12; attempt++) {
    try { await checkPublicApi(baseUrl); console.log('Public API proxy smoke: PASS (docs, spec, assets, key-free JSON 401)'); failure = undefined; break; }
    catch (error) { failure = error; if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  if (failure) { console.error(failure.message); process.exitCode = 1; }
}

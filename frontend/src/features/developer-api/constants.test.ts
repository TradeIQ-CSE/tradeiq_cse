import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_PUBLIC_API_BASE_URL', ''); });
afterEach(() => vi.unstubAllEnvs());
describe('API reference destinations', () => {
  it('opens the local explorer in development while examples retain the canonical public URL', async () => {
    vi.stubEnv('DEV', true);
    const constants = await import('./constants');
    expect(constants.PUBLIC_API_DOCS_URL).toBe('http://localhost:3001/public/v1/docs');
    expect(constants.PUBLIC_API_SPEC_URL).toBe('http://localhost:3001/public/v1/openapi.json');
    expect(constants.PUBLIC_API_BASE_URL).toBe('https://tradeiqcse.tech/api/public/v1');
  });
  it('uses canonical same-origin proxy links in production, never the market-prefixed diagnostic path', async () => {
    vi.stubEnv('DEV', false);
    const constants = await import('./constants');
    expect(constants.PUBLIC_API_DOCS_URL).toBe('/api/public/v1/docs');
    expect(constants.PUBLIC_API_SPEC_URL).toBe('/api/public/v1/openapi.json');
  });
  it('allows an explicit preview documentation base without changing example requests', async () => {
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://preview.example.test/api/public/v1/');
    const constants = await import('./constants');
    expect(constants.PUBLIC_API_DOCS_URL).toBe('https://preview.example.test/api/public/v1/docs');
    expect(constants.PUBLIC_API_BASE_URL).toBe('https://tradeiqcse.tech/api/public/v1');
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnvironment } from './local-environment';

describe('root local environment', () => {
  const original = process.env;
  let directory: string;
  let file: string;

  beforeEach(() => {
    process.env = { PATH: original.PATH };
    directory = mkdtempSync(join(tmpdir(), 'tradeiq-config-'));
    file = join(directory, '.env');
    writeFileSync(
      file,
      'AUTH_DATABASE_URL=postgresql://local/service\nAUTH_JWT_PUBLIC_KEYS=public-test-value\nUNRELATED_SECRET=private-test-value\n',
    );
  });

  afterEach(() => {
    process.env = original;
    rmSync(directory, { recursive: true });
  });

  it('loads only owned values and preserves external overrides', () => {
    process.env.AUTH_DATABASE_URL = 'postgresql://injected/service';
    loadLocalEnvironment(file);
    expect(process.env.AUTH_DATABASE_URL).toBe('postgresql://injected/service');
    expect(process.env.AUTH_JWT_PUBLIC_KEYS).toBe('public-test-value');
    expect(process.env.UNRELATED_SECRET).toBeUndefined();
  });

  it('does not load a local file in production', () => {
    process.env.NODE_ENV = 'production';
    loadLocalEnvironment(file);
    expect(process.env.AUTH_DATABASE_URL).toBeUndefined();
  });

  it('allows injected configuration without a local file', () => {
    expect(() =>
      loadLocalEnvironment(join(directory, 'missing')),
    ).not.toThrow();
  });
});

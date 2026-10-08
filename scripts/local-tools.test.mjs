import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { repoRoot, serviceEnvironment, services } from './local-environment.mjs';

function withEnvironmentFile(callback) {
  const directory = mkdtempSync(resolve(tmpdir(), 'tradeiq-environment-'));
  const file = resolve(directory, '.env');
  writeFileSync(file, `
AUTH_DATABASE_URL=postgresql://auth@example/auth
AUTH_JWT_PRIVATE_KEY="private-test-value"
AUTH_EMAIL_ENCRYPTION_KEY=encryption-test-value
MARKET_DATA_DATABASE_URL=postgresql://market@example/market
AUTH_JWT_PUBLIC_KEYS=public-test-value
MARKET_INGESTION_TOKEN=ingestion-test-value
POSTGRES_PASSWORD=database-test-value
REDIS_URL=redis://localhost:6379
ML_DATABASE_URL=postgresql://ml@example/ml
ML_MARKET_TRADING_API_URL=http://localhost:3001
ML_LONG_TRADE_SYMBOLS=COMB.N0000
ML_LONG_TRADE_GRID='{"take_profit_pct":[0.01],"stop_loss_pct":[0.005],"horizon_bars":[24],"test_days":[30]}'
VITE_MARKET_TRADING_API_URL="http://localhost:3001" # public
CSE_DATASET_ARTIFACT='/tmp/release with spaces.zip'
`);
  try { callback(file); } finally { rmSync(directory, { recursive: true }); }
}

test('local commands receive only their service settings, including inherited overrides', () => {
  withEnvironmentFile((file) => {
    for (const name of Object.keys(services)) {
      const result = serviceEnvironment(name, {
        PATH: '/tool/path', AUTH_JWT_PRIVATE_KEY: 'shell-private',
        POSTGRES_PASSWORD: 'shell-password', MARKET_INGESTION_TOKEN: 'shell-token',
        VITE_MARKET_TRADING_API_URL: 'https://example.test/api/market',
        ML_LONG_TRADE_N_JOBS: '1',
      }, file);
      assert.equal(result.PATH, '/tool/path');
      assert.equal(result.POSTGRES_PASSWORD, undefined);
      assert.equal(result.AUTH_JWT_PRIVATE_KEY,
        name === 'identity-auth' ? 'shell-private' : undefined);
      assert.equal(result.MARKET_INGESTION_TOKEN,
        name === 'market-trading' ? 'shell-token' : undefined);
      assert.equal(result.VITE_MARKET_TRADING_API_URL,
        name === 'frontend' ? 'https://example.test/api/market' : undefined);
      assert.equal(result.ML_MARKET_TRADING_API_URL,
        name === 'ml-prediction' ? 'http://localhost:3001' : undefined);
      assert.equal(result.ML_LONG_TRADE_SYMBOLS,
        name === 'ml-prediction' ? 'COMB.N0000' : undefined);
      assert.equal(result.ML_LONG_TRADE_N_JOBS,
        name === 'ml-prediction' ? '1' : undefined);
      if (name === 'ml-prediction') assert.equal(JSON.parse(result.ML_LONG_TRADE_GRID).horizon_bars[0], 24);
      else assert.equal(result.ML_LONG_TRADE_GRID, undefined);
    }
    assert.equal(serviceEnvironment('data-ingestion', {}, file).CSE_DATASET_ARTIFACT,
      '/tmp/release with spaces.zip');
  });
});

test('production commands use injected settings and never load local credentials', () => {
  withEnvironmentFile((file) => {
    const result = serviceEnvironment('identity-auth', {
      NODE_ENV: 'production', AUTH_DATABASE_URL: 'postgresql://injected/auth',
    }, file);
    assert.equal(result.AUTH_DATABASE_URL, 'postgresql://injected/auth');
    assert.equal(result.AUTH_JWT_PRIVATE_KEY, undefined);
  });
});

test('native Nest loaders and command launchers select the same service variables', () => {
  for (const name of ['market-trading', 'identity-auth']) {
    const source = readFileSync(resolve(repoRoot, services[name].directory,
      'src/config/local-environment.ts'), 'utf8');
    const block = source.match(/const KEYS = \[([\s\S]*?)\] as const/)[1];
    const keys = [...block.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    assert.deepEqual(keys.sort(), [...services[name].keys].sort());
  }
});

test('service command forwards arguments and its failure exit status', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'tradeiq-command-'));
  writeFileSync(resolve(directory, 'uv'), '#!/bin/sh\n[ "$1" = run ] && [ "$2" = python ] && [ "$3" = --version ] || exit 99\nexit 17\n', { mode: 0o755 });
  try {
    const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/run.mjs'),
      'data-ingestion', 'python', '--version'], {
      cwd: directory, env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 17, result.stderr);
  } finally { rmSync(directory, { recursive: true }); }
});

test('a failed development watcher stops its sibling process groups', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'tradeiq-watchers-'));
  const log = resolve(directory, 'watchers.log');
  mkdirSync(resolve(directory, 'scripts'));
  for (const file of ['dev.mjs', 'local-environment.mjs']) {
    copyFileSync(resolve(repoRoot, 'scripts', file), resolve(directory, 'scripts', file));
  }
  for (const name of ['market-trading', 'identity-auth', 'frontend']) {
    mkdirSync(resolve(directory, services[name].directory, 'node_modules'), { recursive: true });
  }
  writeFileSync(resolve(directory, 'pnpm'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const name = require('node:path').basename(process.cwd());
const write = (message) => appendFileSync(process.env.TEST_WATCHER_LOG, name + ':' + message + '\\n');
write('started');
process.on('SIGTERM', () => { write('stopped'); process.exit(0); });
setInterval(() => {}, 1000);
if (name === 'market-trading') setTimeout(() => process.exit(17), 750);
`, { mode: 0o755 });
  try {
    const child = spawn(process.execPath, [resolve(directory, 'scripts/dev.mjs')], {
      cwd: directory,
      env: { ...process.env, NODE_ENV: 'test', TEST_WATCHER_LOG: log,
        MARKET_DATA_DATABASE_URL: 'postgresql://local/market', REDIS_URL: 'redis://localhost:6379',
        AUTH_DATABASE_URL: 'postgresql://local/auth', AUTH_JWT_PRIVATE_KEY: 'private-test',
        AUTH_JWT_PUBLIC_KEYS: 'public-test', AUTH_EMAIL_ENCRYPTION_KEY: 'encryption-test',
        PATH: `${directory}:${process.env.PATH}` },
      stdio: 'ignore',
    });
    const deadline = setTimeout(() => child.kill('SIGTERM'), 10000);
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code));
    });
    clearTimeout(deadline);
    assert.equal(result, 17);
    const events = readFileSync(log, 'utf8');
    assert.match(events, /frontend:stopped/);
    assert.match(events, /identity-auth:stopped/);
  } finally { rmSync(directory, { recursive: true }); }
});

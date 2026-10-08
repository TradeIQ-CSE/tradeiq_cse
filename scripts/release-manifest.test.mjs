import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createImageRecord, createReleaseManifest, RELEASE_SERVICES } from './release-manifest.mjs';

const commit = 'a'.repeat(40);
const repository = 'TradeIQ-CSE/tradeiq_cse';
const records = RELEASE_SERVICES.map((service, index) => createImageRecord({
  repository, commit, service, digest: `sha256:${String(index).repeat(64)}`,
}));
const options = {
  records, repository, commit, channel: 'dev', runId: '123', runAttempt: '1',
  publicOrigin: 'https://tradeiqcse.tech', createdAt: '2026-10-07T12:00:00.000Z',
};
const script = fileURLToPath(new URL('./release-manifest.mjs', import.meta.url));

test('complete release has matching SHA tags and immutable digest references in stable service order', () => {
  const result = createReleaseManifest({ ...options, records: [...records].reverse() });
  assert.deepEqual(Object.keys(result.images), RELEASE_SERVICES);
  for (const record of records) {
    assert.deepEqual(result.images[record.service], {
      tag: `${record.image}:${commit}`, digest: record.digest,
      reference: `${record.image}@${record.digest}`,
    });
  }
  assert.equal(result.workflow_run.url, `https://github.com/${repository}/actions/runs/123`);
  assert.ok(!RELEASE_SERVICES.includes('ml-long-trade'));
});

for (const [name, mutate] of [
  ['missing service', (value) => value.records.pop()],
  ['extra service', (value) => value.records.push(value.records[0])],
  ['duplicate service', (value) => value.records[1] = value.records[0]],
  ['wrong commit', (value) => value.records[0].commit = 'b'.repeat(40)],
  ['wrong repository', (value) => value.records[0].repository = 'another/repo'],
  ['wrong image path', (value) => value.records[0].image = 'ghcr.io/another/repo/frontend'],
  ['missing digest', (value) => delete value.records[0].digest],
  ['malformed digest', (value) => value.records[0].digest = 'sha256:not-a-digest'],
  ['unknown service', (value) => value.records[0].service = 'ml-long-trade'],
  ['invalid SHA', (value) => value.commit = 'dev'],
  ['unsupported channel', (value) => value.channel = 'feature/branch'],
  ['missing run ID', (value) => delete value.runId],
  ['invalid run attempt', (value) => value.runAttempt = '0'],
  ['HTTP origin', (value) => value.publicOrigin = 'http://tradeiqcse.tech'],
  ['origin with credentials', (value) => value.publicOrigin = 'https://user:pass@tradeiqcse.tech'],
  ['origin with path', (value) => value.publicOrigin = 'https://tradeiqcse.tech/api'],
  ['invalid date', (value) => value.createdAt = 'bad-date'],
]) {
  test(`reject ${name} before publication`, () => {
    const value = structuredClone(options);
    mutate(value);
    assert.throws(() => createReleaseManifest(value));
  });
}

test('CLI assembles real image records and does not replace output for an incomplete release', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tradeiq-release-manifest-'));
  try {
    const env = { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_SHA: commit,
      GITHUB_REF_NAME: 'dev', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', PUBLIC_ORIGIN: options.publicOrigin };
    for (const record of records) {
      const result = spawnSync(process.execPath, [script, 'image', record.service, record.digest, join(directory, `${record.service}.json`)], { env });
      assert.equal(result.status, 0, result.stderr.toString());
    }
    const output = join(directory, 'manifest.out');
    const result = spawnSync(process.execPath, [script, 'release', directory, output], { env });
    assert.equal(result.status, 0, result.stderr.toString());
    const manifest = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(manifest.images, createReleaseManifest(options).images);
    await rm(join(directory, `${records[0].service}.json`));
    await writeFile(output, 'previous completed release');
    const failed = spawnSync(process.execPath, [script, 'release', directory, output], { env });
    assert.notEqual(failed.status, 0);
    assert.equal(await readFile(output, 'utf8'), 'previous completed release');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_SERVICES = [
  'market-trading', 'identity-auth', 'ml-prediction', 'frontend', 'data-ingestion',
];
export const RELEASE_JOBS = ['ml-long-trade'];
export const RELEASE_IMAGES = [...RELEASE_SERVICES, ...RELEASE_JOBS];

function requireMatch(value, pattern, name) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function imageName(repository, service) {
  requireMatch(repository, /^[\w-]+\/[\w.-]+$/, 'repository');
  if (!RELEASE_IMAGES.includes(service)) throw new Error(`Unknown service: ${service}`);
  return `ghcr.io/${repository.toLowerCase()}/${service}`;
}

export function createImageRecord({ repository, commit, service, digest }) {
  const image = imageName(repository, service);
  requireMatch(commit, /^[a-f0-9]{40}$/, 'commit SHA');
  requireMatch(digest, /^sha256:[a-f0-9]{64}$/, 'image digest');
  return { repository, commit, service, image, digest };
}

export function createReleaseManifest({
  records, repository, commit, channel, runId, runAttempt, publicOrigin, createdAt,
}) {
  requireMatch(commit, /^[a-f0-9]{40}$/, 'commit SHA');
  requireMatch(channel, /^dev$/, 'release channel');
  requireMatch(runId, /^[1-9][0-9]*$/, 'workflow run ID');
  requireMatch(runAttempt, /^[1-9][0-9]*$/, 'workflow run attempt');
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) {
    throw new Error('Public origin must be an HTTPS origin without a path');
  }
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid creation date');
  if (!Array.isArray(records) || records.length !== RELEASE_IMAGES.length) {
    throw new Error('Release requires all five application images and the ML batch image');
  }

  const images = {};
  for (const record of records) {
    const expected = createImageRecord(record);
    if (record.repository !== repository || record.commit !== commit || record.image !== expected.image) {
      throw new Error(`Image provenance mismatch: ${record.service}`);
    }
    if (images[record.service]) throw new Error(`Duplicate service: ${record.service}`);
    images[record.service] = {
      tag: `${record.image}:${commit}`,
      digest: record.digest,
      reference: `${record.image}@${record.digest}`,
    };
  }
  for (const service of RELEASE_IMAGES) {
    if (!images[service]) throw new Error(`Missing service: ${service}`);
  }

  return {
    schema_version: 1,
    repository,
    commit,
    channel,
    created_at: createdAt,
    public_origin: publicOrigin,
    workflow_run: {
      id: runId,
      attempt: runAttempt,
      url: `https://github.com/${repository}/actions/runs/${runId}`,
    },
    images: Object.fromEntries(RELEASE_SERVICES.map((service) => [service, images[service]])),
    // Keep the application image set compatible with the existing EC2 consumer.
    // The separately enabled scheduler reads batch images from this same release.
    job_images: Object.fromEntries(RELEASE_JOBS.map((service) => [service, images[service]])),
  };
}

async function main() {
  const [mode, first, second, third] = process.argv.slice(2);
  const { GITHUB_REPOSITORY: repository, GITHUB_SHA: commit } = process.env;
  let document;
  let output;
  if (mode === 'image') {
    document = createImageRecord({ repository, commit, service: first, digest: second });
    output = third;
  } else if (mode === 'release') {
    const names = (await readdir(first)).filter((name) => name.endsWith('.json'));
    const records = await Promise.all(names.map(async (name) => JSON.parse(await readFile(join(first, name), 'utf8'))));
    document = createReleaseManifest({
      records, repository, commit,
      channel: process.env.GITHUB_REF_NAME,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      publicOrigin: process.env.PUBLIC_ORIGIN,
      createdAt: new Date().toISOString(),
    });
    output = second;
  } else {
    throw new Error('Usage: release-manifest.mjs image SERVICE DIGEST OUTPUT | release RECORDS_DIRECTORY OUTPUT');
  }
  if (!output) throw new Error('Output path is required');
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

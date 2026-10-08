#!/usr/bin/env bash
set -euo pipefail

manifest=${1:?Usage: publish-release.sh MANIFEST}
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
[[ "$GITHUB_REF_NAME" == dev ]] || { echo 'Only the dev release channel is supported' >&2; exit 1; }
release_tag="release-$GITHUB_REF_NAME-$GITHUB_SHA"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

# List with the authenticated token so unfinished drafts are visible on retries.
gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100" --paginate --slurp > "$work_dir/releases.json"
existing_state=$(node - "$work_dir/releases.json" "$release_tag" "$work_dir/existing.json" <<'JS'
const fs = require('node:fs');
const matches = JSON.parse(fs.readFileSync(process.argv[2])).flat()
  .filter((release) => release.tag_name === process.argv[3]);
if (matches.length > 1) throw new Error('Multiple releases have the expected tag');
if (!matches.length) {
  console.log('missing');
} else {
  const release = matches[0];
  if (typeof release.draft !== 'boolean') throw new Error('Invalid release response');
  fs.writeFileSync(process.argv[4], JSON.stringify(release));
  console.log(release.draft ? 'draft' : 'published');
}
JS
)
# A completed release is immutable. A rerun keeps its original image digests.
if [[ "$existing_state" == published ]]; then
  echo "Completed release already exists: $release_tag"
  exit 0
fi

assert_current_commit() {
  local current
  current=$(gh api "repos/$GITHUB_REPOSITORY/branches/$GITHUB_REF_NAME" --jq '.commit.sha')
  [[ "$current" == "$GITHUB_SHA" ]] || { echo 'Branch advanced; this commit will not be released' >&2; exit 1; }
}
assert_current_commit

# Revalidate before any publication and produce fixed, validated promotion arguments.
node --input-type=module - "$manifest" > "$work_dir/images" <<'JS'
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createReleaseManifest } from './scripts/release-manifest.mjs';
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const repository = process.env.GITHUB_REPOSITORY;
const commit = process.env.GITHUB_SHA;
const records = [...Object.entries(manifest.images ?? {}), ...Object.entries(manifest.job_images ?? {})].map(([service, image]) => ({
  repository: manifest.repository, commit: manifest.commit, service,
  image: image.reference?.split('@')[0], digest: image.digest,
}));
const validated = createReleaseManifest({
  records, repository, commit, channel: process.env.GITHUB_REF_NAME,
  runId: manifest.workflow_run?.id, runAttempt: manifest.workflow_run?.attempt,
  publicOrigin: manifest.public_origin, createdAt: manifest.created_at,
});
if (!isDeepStrictEqual(validated, manifest)) throw new Error('Manifest metadata or image references differ from the validated release');
for (const image of [...Object.values(validated.images), ...Object.values(validated.job_images)]) {
  console.log(`${image.tag} ${image.reference}`);
}
JS

# Create the lightweight tag explicitly; a draft release may not create it yet.
if ! gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/$release_tag" > "$work_dir/tag.json" 2> "$work_dir/tag-error"; then
  if ! grep -q 'HTTP 404' "$work_dir/tag-error"; then
    cat "$work_dir/tag-error" >&2
    exit 1
  fi
  gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" \
    -f "ref=refs/tags/$release_tag" -f "sha=$GITHUB_SHA" > "$work_dir/tag.json"
fi
node -e 'const tag=JSON.parse(require("node:fs").readFileSync(process.argv[1]));process.exit(tag.object?.type === "commit" && tag.object.sha === process.env.GITHUB_SHA ? 0 : 1)' "$work_dir/tag.json" \
  || { echo 'Release tag does not point at the expected commit' >&2; exit 1; }

# Upload everything while the release is a draft. Only the final edit makes it deployable.
if [[ ! -s "$work_dir/existing.json" ]]; then
  gh release create "$release_tag" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" \
    --title "dev ${GITHUB_SHA:0:12}" --notes "CI passed; all application and batch image digests are recorded in release.json." \
    --draft --prerelease --latest=false
fi
cp "$manifest" "$work_dir/release.json"
(cd "$work_dir" && shasum -a 256 release.json > release.json.sha256)
gh release upload "$release_tag" "$work_dir/release.json" "$work_dir/release.json.sha256" \
  --repo "$GITHUB_REPOSITORY" --clobber

# The VM selects digest references from a completed manifest.
# Commit tags provide readable registry names without changing those references.
while read -r tag reference; do
  docker buildx imagetools create --prefer-index=false --tag "$tag" "$reference"
done < "$work_dir/images"

assert_current_commit
gh release edit "$release_tag" --repo "$GITHUB_REPOSITORY" --draft=false --prerelease --latest=false
echo "Completed release published: $release_tag"

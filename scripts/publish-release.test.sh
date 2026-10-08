#!/usr/bin/env bash
# Exercise publication failures without contacting GitHub or a registry.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir "$fixture/bin"
export PATH="$fixture/bin:$PATH"
export GITHUB_REPOSITORY=TradeIQ-CSE/tradeiq_cse
export GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export GITHUB_REF_NAME=dev
export RELEASE_FIXTURE="$fixture"

node --input-type=module - "$fixture/release.json" <<'JS'
import { writeFileSync } from 'node:fs';
import { createImageRecord, createReleaseManifest, RELEASE_IMAGES } from './scripts/release-manifest.mjs';
const repository = process.env.GITHUB_REPOSITORY, commit = process.env.GITHUB_SHA;
const records = RELEASE_IMAGES.map((service, index) => createImageRecord({ repository, commit, service, digest: `sha256:${String(index).repeat(64)}` }));
writeFileSync(process.argv[2], JSON.stringify(createReleaseManifest({ records, repository, commit, channel: 'dev', runId: '123', runAttempt: '1', publicOrigin: 'https://tradeiqcse.tech', createdAt: '2026-10-07T12:00:00.000Z' })));
JS

cat > "$fixture/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\n' "$*" >> "$RELEASE_FIXTURE/commands"
if [[ "$1" == api ]]; then
  if [[ "$2" == --method ]]; then
    [[ "$CASE" != tag_create_failure ]] || exit 1
    printf '{"object":{"type":"commit","sha":"%s"}}\n' "$GITHUB_SHA"
  elif [[ "$2" == *"/releases?per_page=100" ]]; then
    tag="release-dev-$GITHUB_SHA"
    case "$CASE" in
      completed) printf '[[{"tag_name":"%s","draft":false}]]\n' "$tag" ;;
      draft) printf '[[{"tag_name":"%s","draft":true}]]\n' "$tag" ;;
      api_failure) echo 'HTTP 403' >&2; exit 1 ;;
      invalid_response) printf '[[{"tag_name":"%s"}]]\n' "$tag" ;;
      duplicate_releases) printf '[[{"tag_name":"%s","draft":true},{"tag_name":"%s","draft":true}]]\n' "$tag" "$tag" ;;
      *) echo '[[]]' ;;
    esac
  elif [[ "$2" == */git/ref/tags/* ]]; then
    if [[ "$CASE" == tag_mismatch ]]; then
      echo '{"object":{"type":"commit","sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
    elif [[ "$CASE" == existing_tag || "$CASE" == draft ]]; then
      printf '{"object":{"type":"commit","sha":"%s"}}\n' "$GITHUB_SHA"
    else
      echo 'HTTP 404' >&2; exit 1
    fi
  elif [[ "$2" == */branches/dev ]]; then
    if [[ "$CASE" == stale || ( "$CASE" == advanced_during_promotion && -f "$RELEASE_FIXTURE/promoted" ) ]]; then
      printf '%040d\n' 1
    else
      echo "$GITHUB_SHA"
    fi
  else
    echo 'Unexpected API call' >&2; exit 1
  fi
elif [[ "$1 $2" == 'release create' ]]; then
  [[ "$CASE" != create_failure ]] || exit 1
elif [[ "$1 $2" == 'release upload' ]]; then
  [[ "$CASE" != upload_failure ]] || exit 1
  cp "$4" "$RELEASE_FIXTURE/uploaded.json"
  cp "$5" "$RELEASE_FIXTURE/uploaded.sha256"
elif [[ "$1 $2" == 'release edit' ]]; then
  touch "$RELEASE_FIXTURE/published"
else
  echo 'Unexpected gh command' >&2; exit 1
fi
MOCK
cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >> "$RELEASE_FIXTURE/commands"
[[ "$CASE" != promotion_failure ]] || exit 1
touch "$RELEASE_FIXTURE/promoted"
MOCK
chmod +x "$fixture/bin/gh" "$fixture/bin/docker"

run_case() {
  export CASE=$1
  rm -f "$fixture/commands" "$fixture/published" "$fixture/promoted" "$fixture/uploaded.json" "$fixture/uploaded.sha256"
  if bash scripts/publish-release.sh "$fixture/release.json" > "$fixture/output" 2>&1; then actual=0; else actual=1; fi
  [[ "$actual" == "$2" ]] || { cat "$fixture/output" >&2; echo "FAIL: $CASE exit status" >&2; exit 1; }
}

for scenario in success existing_tag draft; do
  run_case "$scenario" 0
  [[ -f "$fixture/published" ]]
  [[ $(grep -c '^docker ' "$fixture/commands") == 6 ]]
  grep -q -- '/ml-long-trade:' "$fixture/commands"
  ! grep -q -- ':dev ' "$fixture/commands"
  [[ $(grep '^docker ' "$fixture/commands" | grep -cE -- '--tag [^ ]+ --tag') == 0 ]]
  grep -q -- '--prefer-index=false' "$fixture/commands"
  grep -q -- '--draft --prerelease' "$fixture/commands" || [[ "$scenario" == draft ]]
  tail -1 "$fixture/commands" | grep -q -- 'release edit .*--draft=false'
  cmp "$fixture/release.json" "$fixture/uploaded.json"
  [[ "$(cut -d ' ' -f1 "$fixture/uploaded.sha256")" == "$(shasum -a 256 "$fixture/release.json" | cut -d ' ' -f1)" ]]
  echo "PASS: $scenario uploads complete manifest/checksum, promotes six images, then publishes"
done

run_case completed 0
[[ ! -f "$fixture/promoted" && ! -f "$fixture/published" ]]
[[ $(wc -l < "$fixture/commands") == 1 ]]
echo 'PASS: rerunning a completed release preserves previous images and assets'

for scenario in api_failure invalid_response duplicate_releases stale tag_mismatch tag_create_failure create_failure upload_failure promotion_failure advanced_during_promotion; do
  run_case "$scenario" 1
  [[ ! -f "$fixture/published" ]]
  echo "PASS: $scenario cannot publish a completed release"
done

cp "$fixture/release.json" "$fixture/valid.json"
for mutation in incomplete missing_batch altered_batch wrong_commit altered_reference unsupported_schema; do
  cp "$fixture/valid.json" "$fixture/release.json"
  node - "$fixture/release.json" "$mutation" <<'JS'
const fs = require('node:fs');
const value = JSON.parse(fs.readFileSync(process.argv[2]));
switch (process.argv[3]) {
  case 'incomplete': delete value.images.frontend; break;
  case 'missing_batch': delete value.job_images; break;
  case 'altered_batch': value.job_images['ml-long-trade'].reference = 'ghcr.io/untrusted/job@sha256:'+'f'.repeat(64); break;
  case 'wrong_commit': value.commit = 'b'.repeat(40); break;
  case 'altered_reference': value.images.frontend.reference = value.images.frontend.reference.replace(/sha256:.*/, 'sha256:'+'f'.repeat(64)); break;
  case 'unsupported_schema': value.schema_version = 2; break;
}
fs.writeFileSync(process.argv[2], JSON.stringify(value));
JS
  run_case "$mutation" 1
  [[ ! -f "$fixture/promoted" && ! -f "$fixture/published" ]]
  ! grep -q 'gh release create' "$fixture/commands"
  echo "PASS: $mutation is rejected before publication or image promotion"
done

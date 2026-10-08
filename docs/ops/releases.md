# Image releases

The Deploy workflow runs on pushes to `dev`, or a manual dispatch on that branch.
It calls the existing CI workflow at the same commit, including lint, type checks,
unit/API tests, migrations, importer checks and the Compose smoke test. Failed or
cancelled checks prevent publishing.

## Publication sequence

1. Build and push six candidate images: market-trading, identity-auth,
   ml-prediction, frontend, data-ingestion and the separate ml-long-trade batch
   image. Each candidate tag includes the commit SHA, workflow run ID and attempt.
2. Collect the registry digest from every successful build. A missing image,
   duplicate service, mismatched commit/repository or invalid digest prevents
   assembling a release.
3. Create a draft GitHub release named `release-dev-<full-commit-sha>`, pointing at
   that exact source commit. Upload `release.json` and `release.json.sha256`.
4. Promote all six digest references to their commit-SHA tags. No image is
   rebuilt during promotion; branch tags are not used for deployment.
5. Publish the draft only after uploads and promotion succeed and the commit is
   still the head of `dev`. Dev releases are prereleases and do not replace the
   repository's latest stable release.

`release.json` records the source commit, workflow run, frontend public origin,
and each image's SHA tag, registry digest and `image@sha256:...` reference. Digest
references are the authoritative runtime inputs; tags are convenient names.

The five existing application images remain under `images`. The batch image is
recorded under `job_images.ml-long-trade`, with the same tag, digest and reference
fields. Both sets are required before a release can be published. Keeping the
application set unchanged lets the existing EC2 release consumer accept these
manifests without an immediate server configuration update. Publishing a batch
image does not enable scheduled training.

## Failures and reruns

A failed build may leave candidate images in GHCR, but no completed release.
A failed upload/promotion leaves a draft; consumers must ignore draft releases.
API authorization/network errors fail the job rather than being treated as a
missing release. A commit superseded during CI is not published.

A rerun of a completed release leaves its image tags and manifest unchanged.
A retry of a draft can replace its assets and finish publication. Earlier
completed releases are retained, so their manifests remain available for rollback.
Do not delete those releases or the GHCR versions they reference while they are
needed for rollback.

## VM selection and rollback

The server-owned deployment timer checks published, non-draft `release-dev-*`
releases every five minutes. It downloads one release's manifest and checksum,
validates their repository, commit, image set and digest references, and stages
all images before updating applications. It does not clone or pull source code.

An unavailable API, invalid manifest or failed pull leaves the current applications
running. After an application update, health and image checks must pass before
the current-release marker changes. A failed update reapplies the previous image
selection. PostgreSQL, Redis and certificate renewal remain running during updates.
Database migrations still require backward compatibility; restoring image versions
does not undo schema changes.

The migration started with a bootstrap record containing the exact five existing
image digests. It keeps that version until this workflow publishes its first
completed release. A bootstrap record is an operator snapshot, not a CI release.

Operators can select and pin an earlier completed release using
`bin/deploy.sh --release release-dev-<full-commit-sha>` on the VM.
`bin/deploy.sh --resume` returns to automatic updates. Preserve completed release
assets and their GHCR image versions for as long as they are needed for rollback.
See [Deployment](deployment.md) for server paths and operational checks.

The separately enabled ML scheduler must read its batch digest from the manifest
for `.state/current-release`, not from a branch tag or the latest release in
isolation. An older or bootstrap selection without `job_images` keeps training
disabled. This preserves application rollback and release provenance.

## Local verification

```bash
node --test scripts/release-manifest.test.mjs
bash scripts/publish-release.test.sh
```

These checks validate manifest assembly and publication failure handling with
local fixtures. They do not upload images, create GitHub releases or deploy to
EC2. Workflow syntax can also be checked with `actionlint`.

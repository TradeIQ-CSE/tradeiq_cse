# GitHub #73 — Docker Compose end-to-end smoke test plan

Status: implemented and locally verified
Created: 2026-09-07
Target base: current `origin/dev`
Issue: https://github.com/TradeIQ-CSE/tradeiq_cse/issues/73

## Objective

Add one reproducible smoke test that starts the production-shaped Docker Compose
stack from an empty, isolated database volume and proves the principal HTTP
boundaries work together:

```text
smoke runner -> frontend static image and public market API
smoke runner -> browser-style identity-auth session
identity-auth -> market-trading quote/valuation API
all services -> their own migrated database
```

This complements the existing unit, service E2E, migration, and seed jobs. It
must not duplicate their exhaustive domain assertions. Its purpose is to catch
broken images, startup ordering, migrations, seed orchestration, environment
wiring, ports, CORS-facing origins, and real cross-container HTTP calls.

## Current-state evidence

- `docker-compose.yml` defines Postgres, both Nest services, the FastAPI ML
  service, the static frontend, the ML migration job, and the market seed job.
- `market-trading` and Postgres have Compose health checks. The remaining
  services have HTTP health or static responses but no Compose health checks.
- `market-data-seed` and `ml-prediction-migrate` are one-shot jobs whose exit
  codes must be checked before API assertions start.
- Current CI tests workspaces and Python services separately, applies all
  migrations, tests the seed twice, and runs service E2E suites. It never boots
  the actual images together.
- Service-level order E2E tests stub the market-trading client. A Compose smoke
  order therefore provides distinct coverage of the real REST boundary.
- A normal local TradeIQ stack may already occupy ports 5432, 3001, 3002 and
  8001, so the smoke stack cannot reuse the default project name or host ports.

## Scope

### 1. Isolated orchestration command

Add a root command, backed by a small shell orchestrator, for example:

```text
pnpm smoke:compose
  -> scripts/compose-smoke.sh
```

The orchestrator will:

1. Require Docker Engine and Docker Compose v2 and fail with a useful message.
2. Generate or accept a unique Compose project name.
3. use explicit smoke-only host ports, with override variables for local use;
4. use explicit test-only JWT, encryption, ingestion, and Postgres values
   instead of inheriting a developer's root `.env`;
5. start the default Compose services with fresh images and a fresh named
   volume;
6. wait for `market-data-seed` and `ml-prediction-migrate` to exit successfully;
7. poll the HTTP surfaces with bounded retries and a global timeout;
8. run the API journey described below;
9. always print `docker compose ps --all` on failure;
10. retain useful, non-coloured service logs as a CI artifact on failure; and
11. tear down containers, networks, and the smoke volume in a trap on success,
    failure, or interruption.

The default local smoke ports should be outside the ordinary stack's range,
for example 55432, 53001, 53002, 58001, and 55173. The script must validate
that its project name and chosen ports are non-empty before any cleanup command
runs. Cleanup must address only that exact project.

Do not stop, recreate, inspect secrets from, or attach to a developer's normal
`tradeiq-cse` Compose project. Provide an explicit opt-in such as
`SMOKE_KEEP_STACK=1` for local failure investigation; automatic cleanup remains
the default.

### 2. HTTP smoke runner

Add a dependency-free Node `.mjs` runner using the Node 20 `fetch` API. Keeping
HTTP assertions outside shell avoids a dependency on `jq`, makes envelope
checks readable, and gives each failed assertion a precise endpoint and value.

The runner receives service origins through smoke-specific environment
variables and applies a short timeout to every request. It must never connect
directly to a service database.

#### Readiness and image checks

- `GET market-trading /health` -> `200`, `{status: "ok", service:
  "market-trading"}`.
- `GET identity-auth /health` -> matching identity response.
- `GET ml-prediction /health` -> matching ML response.
- `GET frontend /` -> `200` HTML containing the application root.
- Fetch the frontend's referenced entry JS and CSS assets and require `200`, so
  an incomplete static image cannot pass on `index.html` alone.
- Send representative CORS preflights from the configured frontend origin to
  both Nest APIs and assert the expected origin header, plus the credential
  header on identity-auth. This checks the browser-facing wiring without
  adding a browser test framework.

Readiness polling must distinguish a service that has not started yet from an
eventual assertion failure. It should report the last connection error or HTTP
status when the deadline expires.

#### Seeded public-market journey

Use only the bundled deterministic sample fixture:

- list securities and assert six records, `as_of: 2025-01-10`, and canonical
  `COMB.N0000` data;
- retrieve `COMB.N0000` security detail and assert the canonical symbol and
  latest seeded date;
- retrieve daily OHLCV and assert a non-empty ascending series bounded by the
  sample coverage dates.

These are contract assertions, not snapshots of every field. They should fail
when the seed did not finish or when the market API is wired to the wrong
database.

#### Authenticated cross-service journey

1. Sign up a uniquely named smoke investor through `POST /auth/signup`.
2. Capture the HttpOnly refresh cookie from `Set-Cookie` without logging it.
3. Refresh once through `POST /auth/refresh`, assert rotation succeeds, and use
   the returned access token for the remainder of the journey.
4. Call `GET /auth/me` and assert the authenticated user identity and investor
   role.
5. Prove an unauthenticated portfolio request returns the shared `401`
   envelope.
6. Create a portfolio with a unique `Idempotency-Key` and LKR 1,000,000 opening
   capital.
7. Replay the identical create request and assert the same response plus
   `Idempotent-Replayed: true`.
8. Submit a small `COMB.N0000` buy order. Assert it is filled and priced at the
   seeded market date. This is the critical real
   `identity-auth -> market-trading` HTTP boundary.
9. Read positions, cash transactions, and summary and assert they reconcile at
   a contract level: one holding, one fill effect, reduced cash, positive
   holdings value, and total equity components that agree.

Use relationship assertions rather than copying fee arithmetic already covered
by service tests. The smoke test should identify a broken boundary, not become
a second accounting suite.

### 3. CI integration

Add a final `compose-smoke` job to `.github/workflows/ci.yml`:

- run on pull requests and the existing protected push target;
- run after the current Node, Python, migrations, and seed jobs, avoiding the
  cost of building the full stack when a faster gate has already failed;
- set a bounded job timeout;
- invoke the same root command used locally;
- upload the smoke log directory only on failure; and
- run cleanup under `if: always()` as a second safety net in addition to the
  script trap.

Use only test credentials generated or declared inside the job. Do not read
repository deployment secrets. Logs must not print access tokens, refresh
cookies, encryption keys, or passwords.

### 4. Documentation

Update the root README with:

- the single local smoke command;
- Docker/Compose prerequisites;
- the fact that the smoke stack is isolated and disposable;
- port override and `SMOKE_KEEP_STACK` examples; and
- where failure logs are written.

Correct only README statements directly contradicted by this work, such as the
stale claim that all services are static skeletons. A broad README rewrite is
outside this issue.

## Expected file changes

- `scripts/compose-smoke.sh` — isolated Compose lifecycle, waits, diagnostics,
  and cleanup.
- `scripts/compose-smoke.mjs` — bounded HTTP/API assertions.
- `docker-compose.smoke.yml` — smoke-specific image tags and published ports
  while preserving each service's fixed internal listen port.
- `package.json` — root `smoke:compose` entry point.
- `.github/workflows/ci.yml` — final integrated smoke job and failure artifact.
- `README.md` — local usage and concise current-state correction.
- Focused tests for any reusable helper extracted from the Node runner, only if
  the runner grows beyond straightforward request/assertion code.

Avoid adding Playwright, a browser, `jq`, a new test framework, or application
runtime dependencies for this issue.

## Failure handling and diagnostics

The command must return non-zero for:

- image build or service startup failure;
- a migration or seed job exiting non-zero;
- an HTTP readiness timeout;
- an unexpected status or malformed shared envelope;
- missing seeded data;
- authentication/cookie rotation failure;
- portfolio idempotency failure;
- cross-service quote/order failure; or
- reconciliation failure in the resulting portfolio reads.

On failure, report the failed phase and endpoint, then show the exact smoke
project's service states. Capture logs for `db`, both migration/seed jobs, all
three services, and `frontend`. Never dump request headers or response cookies.

## Verification plan

1. `bash -n scripts/compose-smoke.sh`.
2. `node --check scripts/compose-smoke.mjs`.
3. `docker compose config --quiet` with the smoke environment.
4. Run the complete smoke command against an empty isolated volume while the
   normal local TradeIQ containers remain running; verify their IDs and uptime
   are unchanged afterwards.
5. Run the smoke command a second time to prove cleanup and repeatability.
6. Force one controlled assertion failure and verify non-zero exit,
   diagnostics, secret redaction, and cleanup.
7. Run existing Node lint, typecheck, build, and test jobs with the repository's
   pinned Node 20/Corepack/pnpm setup.
8. Run both Python lint/test suites.
9. Run the existing migration and seed jobs or their exact CI commands.
10. Push only after the local integrated smoke path and existing checks pass;
    then verify the new GitHub Actions job and every pre-existing job.

## Acceptance criteria

- One documented command starts a fresh isolated Compose stack, exercises the
  public market and authenticated portfolio journeys, and cleans up after
  itself.
- The journey includes a real order call from identity-auth to market-trading;
  no service client is mocked.
- All migration and seed one-shots are proven successful before assertions.
- Running a normal local TradeIQ stack at the same time is safe.
- A failure identifies the responsible phase/service and retains useful logs
  without exposing credentials.
- The command is repeatable locally and is a required CI check.
- Existing unit, service E2E, migration, seed, and frontend checks remain green.

## Non-goals

- Browser automation, screenshot comparison, responsive-layout testing, or the
  advisor-facing frontend quality pass.
- Load, soak, latency, chaos, or production deployment testing.
- Testing every validation or accounting branch already covered by service
  suites.
- Redis, caching, rate limiting, index APIs, admin APIs, ML predictions, or the
  scheduled data pipeline.
- Changing database schemas or API contracts.
- Calling live CSE, dataset, AWS, or ML-provider endpoints.
- Reusing or deleting a developer's existing Compose volume.

## Execution handoff

Before implementation, refresh `origin/dev`, confirm no competing PR or linked
branch has appeared for #73, and confirm the Linear identifier/title used for
the personal branch. Create a new `nimesh/<linear-id>-<linear-slug>` branch in a
separate worktree. Do not implement in the active paper-trading or BoardUI
checkout.

## Local verification result

Implemented on 2026-09-07 in the isolated `.worktrees/tradeiq-tiq82` worktree.
The full smoke command passed twice from a clean disposable database while the
normal local Compose project remained running. A controlled startup failure
also produced project-scoped diagnostics and cleaned up its containers,
network, volume, and smoke image tags.

Static and regression checks completed successfully:

- shell syntax and Node syntax checks;
- merged Compose configuration validation;
- all Node workspace lint, typecheck, build, and test commands;
- both Python Ruff and pytest suites; and
- `git diff --check`.

Remote GitHub Actions verification remains pending until the branch is pushed
and a pull request is opened.

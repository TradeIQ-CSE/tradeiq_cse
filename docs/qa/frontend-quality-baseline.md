# Frontend QA Baseline

Status: Phase 0 complete; Phase 1 recorded separately

Recorded: 14 September 2026, Asia/Colombo

Companion documents:

- `docs/plans/frontend-quality-assurance.md`
- `docs/qa/frontend-route-state-checklist.md`
- `docs/qa/frontend-automated-baseline.md`

## Revision under test

| Field | Value |
| --- | --- |
| Worktree | `.worktrees/tradeiq-frontend-qa` |
| Branch | `nimesh/frontend-quality-assurance` |
| Upstream baseline | `origin/dev` |
| Commit | `3ec30401803e4caa499bd5b246795a91342720dc` |
| Commit subject | `Merge pull request #131 from TradeIQ-CSE/nimesh/frontend-improvements` |
| Repository | `https://github.com/TradeIQ-CSE/tradeiq_cse.git` |

At capture time, local `HEAD` and `origin/dev` were identical. The only worktree
change was the uncommitted QA documentation created for this effort.

## Workstation and toolchain

| Component | Observed value | QA decision |
| --- | --- | --- |
| Operating system | macOS 26.6.2, build 25G83 | Supported local QA host |
| Architecture | Apple arm64 | Record for native/container differences |
| Kernel | Darwin 25.6.0 | Informational |
| Interactive Node | 26.8.2 | Does not satisfy repository engine; do not use for QA commands |
| Repository Node | 20.20.2 through `fnm` | Canonical QA runtime |
| Corepack | 0.34.6 | Informational |
| Repository pnpm | 9.15.0 | Canonical package manager |
| Docker client/server | 29.4.0 / 29.4.0 | Available |
| Docker Compose | 5.1.2 | Available and above the smoke-test minimum |
| Chromium | 155.0.8044.0 | Primary browser |
| Safari | 26.6.2 | WebKit/macOS smoke browser |
| Firefox | Not installed | Required before the Phase 7 Firefox smoke pass |

All repository commands must use the pinned runtime, for example:

```sh
COREPACK_HOME=/private/tmp/tradeiq-corepack \
  fnm exec --using=20.20.2 corepack pnpm --filter @tradeiq/frontend run typecheck
```

The initial pnpm version probe under the sandboxed context could not resolve
`registry.npmjs.org`; the approved network context then verified pnpm 9.15.0.
This was an environment restriction, not a project failure.

## Browser isolation

An empty disposable Chromium user-data directory was created during Phase 0 and
was cleared by the temporary-directory lifecycle before it was used. The user's
existing browser storage was not cleared or modified. When browser QA begins,
create a fresh profile immediately before launching the QA build:

```sh
mktemp -d /private/tmp/tradeiq-qa-3ec3040-chromium.XXXXXX
```

Do not clear the user's ordinary Chromium profile. Remove only the exact disposable
directory after the QA evidence and session checks are complete.

## Application origins

The checked-in defaults are:

| Surface | Default origin |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Market Trading API | `http://localhost:3001` |
| Identity Auth API | `http://localhost:3002` |
| ML Prediction API | `http://localhost:8001` |

Vite receives the Market Trading and Identity Auth origins at build time through
`VITE_MARKET_TRADING_API_URL` and `VITE_IDENTITY_AUTH_API_URL`. Browser QA must
confirm that paper-trading, portfolio, order, and backtest requests reach Market
Trading while login, signup, refresh, logout, and current-user requests reach
Identity Auth.

## Existing local runtime

At the initial Phase 0 capture, the machine had a shared development stack. It was
not the canonical QA environment:

| Surface | Observed state |
| --- | --- |
| Frontend `:5173` | HTTP 200; PID 3432; served from the older `tradeiq-landing` worktree |
| Market Trading `:3001` | HTTP 200 health; container healthy |
| Identity Auth `:3002` | HTTP 200 health; container running |
| PostgreSQL `:5432` | Container healthy |
| ML Prediction `:8001` | Not listening |

The Compose project was named `tradeiq-cse`, but its container labels referred to
more than one older worktree. It may have contained user-created local accounts and
portfolios. Phase 0 deliberately did not restart, rebuild, migrate, seed, or reset
this stack.

Later in Phase 0, OrbStack stopped and its Docker socket disappeared. The previously
published application/database ports were no longer listening. No QA container or
volume had been created. The isolated Compose configuration itself was successfully
validated with `docker compose ... config --quiet`; Phase 1 must start OrbStack and
re-inventory the daemon before creating the disposable stack.

### Existing image inventory

| Image | Image ID |
| --- | --- |
| `postgres:16-alpine` | `57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` |
| `tradeiq/market-trading:latest` | `1b36767835ea1d540cd3eee6cefcdec3ad6a0039b25a7af61b7605b0f819dda1` |
| `tradeiq/identity-auth:latest` | `231b33a6707b134863501252292964cc6d55a6ea64073223429307806a594c05` |
| `tradeiq/ml-prediction:latest` | `93ab688ed257ff6fe0398c17f6eace478d42cb3def3765944548eee97698e0ed` |
| Existing seed image | `7868c935ba9b04f90de7061f0c402349881cb3a185f36714bd62aa2e51bb58c7` |

These IDs document the pre-QA machine state. Phase 1 must capture the isolated
project's newly built IDs separately.

## Market-data baseline

The shared database was queried read-only before OrbStack stopped and contained:

| Field | Value |
| --- | --- |
| Latest successful release | `2025-12-31.3` |
| Contract | `1.0.0` |
| Kind | `full` |
| Coverage | 2017-01-02 through 2025-12-31 |
| Producer commit | `5d1137a5f83688e1d3a4aa2970854b17d070a597` |
| Securities | 448 |
| Daily price rows | 508,140 |
| Latest trade date | 2025-12-31 |
| Release URL | `https://github.com/TradeIQ-CSE/cse-dataset/releases/download/dataset-2025-12-31.3/cse-dataset-2025-12-31.3.zip` |

The live public API agreed with that database snapshot: `/securities?page=1&page_size=1`
reported 448 securities, coverage from 2017-01-02 to 2025-12-31, and `as_of`
2025-12-31.

The repository's bundled smoke fixture is intentionally smaller:

- dataset version `2025-01-10.1`;
- coverage 2025-01-02 through 2025-01-10;
- 6 securities, 42 daily prices, 4 sectors, ASPI, and SL20;
- manifest SHA-256
  `ce403707822a0517462e166fcdfb93feec1c5bf712911e055835f14a47c4accc`.

Use the bundled sample for deterministic Compose smoke assertions. Use release
`2025-12-31.3` for long-range daily/weekly/monthly chart and realistic search,
filter, backtest, and paper-trading QA.

## Isolated QA stack procedure

### Isolation contract

The canonical QA stack will use:

| Setting | Value |
| --- | --- |
| Compose project | `tradeiq-smoke-qa-3ec3040` |
| PostgreSQL host port | 55442 |
| Market Trading host port | 53101 |
| Identity Auth host port | 53102 |
| ML Prediction host port | 58101 |
| Frontend host port | 55183 |

All five ports were available during Phase 0, and the combined base/smoke Compose
configuration parsed successfully with these values. The QA worktree has no `.env`
or `frontend/.env`; secrets must remain runtime-only. Never reuse the shared
`tradeiq-cse` project name or ports for destructive test setup.

### Create and validate the disposable stack

Phase 1 should first run the existing end-to-end smoke path and keep only that
exact isolated project alive:

```sh
COREPACK_HOME=/private/tmp/tradeiq-corepack \
SMOKE_PROJECT_NAME=tradeiq-smoke-qa-3ec3040 \
SMOKE_KEEP_STACK=1 \
SMOKE_DB_PORT=55442 \
SMOKE_MARKET_PORT=53101 \
SMOKE_AUTH_PORT=53102 \
SMOKE_ML_PORT=58101 \
SMOKE_FRONTEND_PORT=55183 \
  fnm exec --using=20.20.2 corepack pnpm run smoke:compose
```

This validates migrations, the bundled sample, service health, frontend assets,
CORS, refresh-cookie rotation, portfolio idempotency, order execution, and basic
reconciliation before the stack becomes a manual QA environment.

Then replace the bundled market fixture with the full release inside the same
isolated database:

```sh
CSE_DATASET_ARTIFACT=https://github.com/TradeIQ-CSE/cse-dataset/releases/download/dataset-2025-12-31.3/cse-dataset-2025-12-31.3.zip \
SMOKE_IMAGE_TAG=tradeiq-smoke-qa-3ec3040 \
  docker compose \
    --project-directory "$PWD" \
    --project-name tradeiq-smoke-qa-3ec3040 \
    --file docker-compose.yml \
    --file docker-compose.smoke.yml \
    run --rm --no-deps market-data-seed
```

Before browser testing, verify the release version, row counts, health endpoints,
and `/securities` metadata. Record the actual values in the Phase 1 report instead
of assuming they match this baseline.

### QA identities

Create identities only in the isolated QA database:

1. Sign up a new investor through the UI and leave it without portfolios for empty
   states.
2. Sign up a second investor and create its portfolio/orders/backtests through the
   UI for populated states.
3. If admin behavior is tested, create an ordinary investor first, capture its
   returned user ID, and promote only that exact row to `admin` in the isolated
   database. Signup must never accept a role from the request body.
4. Generate unique emails and passwords at runtime. Store them only in an ignored
   local QA log or the disposable browser profile, never in Git.

### Teardown

After evidence is collected, first verify the exact project name and then remove
only the isolated project and its volume:

```sh
docker compose \
  --project-directory "$PWD" \
  --project-name tradeiq-smoke-qa-3ec3040 \
  --file docker-compose.yml \
  --file docker-compose.smoke.yml \
  down --volumes --remove-orphans --rmi local
```

Do not run this command against project `tradeiq-cse`.

## Route inventory freeze

The route inventory was derived from `frontend/src/routes/AppRoutes.tsx` at the
baseline commit. It is recorded as an executable checklist in
`docs/qa/frontend-route-state-checklist.md`. Any route added during QA requires an
explicit scope decision because the project is under feature freeze.

## Issue reconciliation

No issue was closed during Phase 0. Static source evidence can identify a candidate
resolution, but each behavioral issue still needs its original reproduction in a
real browser against the isolated stack.

| Issue | Phase 0 finding | Disposition |
| --- | --- | --- |
| #105 Front-end quality pass | Still open. The global document head exists, but route-specific title/description metadata and the complete responsive/browser evidence are absent. | Keep open; primary QA tracker. |
| #116 Security detail hangs on 404 | `SecurityDetailPage` now branches on `detailQuery.isError`, distinguishes `SECURITY_NOT_FOUND`, offers retry for availability errors, and has MSW tests for these states. | Candidate to close after a real 404 browser check. |
| #117 Dashboard blank screen | The dashboard no longer mounts the fixture candlestick that produced the invalid date. It now renders API-backed summaries with explicit error/empty/loading branches and has a focused test. | Candidate to close after authenticated browser and malformed-date regression checks. |
| #118 Random logout | `AuthProvider` protects a completed login from a slower restore failure, and `authFetch` implements single-flight refresh. Existing tests cover the restore race and one 401 refresh, but not multiple simultaneous guarded 401s in a real browser. | Keep open until deliberate navigation, reload, two-tab, and concurrent-request testing passes. |
| #119 Ordinary user opens Admin | `/admin` is wrapped in `RequireAdmin`; non-admins redirect to Markets. The sidebar hides Admin for investors, tests cover the guard, signup cannot select a role, and backend JWT guards fail closed to investor. | Candidate to close only after a freshly signed-up investor is denied on direct URL and reload. |
| #120 Dashboard/Analytics undiscoverable or duplicate | Both Dashboard and Analytics now appear in the route/navigation source. Analytics is an honest capability guide pointing to the backtest flow rather than displaying invented analytics. | Candidate to close after navigation/product-copy browser review. |
| #134 BoardUI refresh | PR #131 merged the shared BoardUI design language across Stages 1–6. | Candidate to close after the main responsive/theme regression pass begins. |
| #135 Paper-trading origin | Every paper-trading API function now passes `MARKET_TRADING_API_URL`; Identity Auth remains the token/session authority. | Candidate to close after one real portfolio/order journey confirms network origins. |

## Phase 0 risks and decisions

- The existing frontend at port 5173 is not built from the QA worktree; do not use
  the initially observed response as evidence for commit `3ec3040`. That server was
  no longer listening after OrbStack stopped.
- The initially observed shared runtime had no ML service at port 8001. ML is outside
  the critical Phase 1 frontend baseline, but the gap must be recorded for later
  planned-state or integration checks.
- OrbStack was stopped by the end of Phase 0. Phase 1 must explicitly start it and
  verify the Docker context before attempting any build or Compose command.
- Firefox is absent. Do not claim cross-browser completion until it is installed or
  an equivalent controlled Firefox run is supplied.
- Release documentation names `2025-12-31.2`, while the active database contains
  the newer `2025-12-31.3`. QA uses the recorded `.3` provenance and should open a
  documentation correction only if the current `dev` documentation remains stale.
- A clean automated pass has not been run in this worktree yet. That is Phase 1,
  not part of the Phase 0 completion claim.

## Phase 0 conclusion

Phase 0 is complete. The revision, runtime, tools, browsers, origins, dataset,
isolation boundary, test-data process, route scope, and open-issue hypotheses are
now explicit. Phase 1 was subsequently completed on 16 September 2026; its current
command results, coverage diagnostic and warning classification are recorded in
`docs/qa/frontend-automated-baseline.md`.

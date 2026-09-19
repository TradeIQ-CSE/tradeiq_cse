# Frontend Automated Regression Baseline

Status: Phase 1 complete

Executed: 16 September 2026, Asia/Colombo

Companion documents:

- `docs/plans/frontend-quality-assurance.md`
- `docs/qa/frontend-quality-baseline.md`
- `docs/qa/frontend-route-state-checklist.md`

## Scope and revision

The commands below tested the current contents of the QA worktree on branch
`nimesh/frontend-quality-assurance`. Its committed base remains
`3ec30401803e4caa499bd5b246795a91342720dc`, but the tested tree also includes the
uncommitted Simple/Advanced backtesting, Simple/Advanced paper-trading, and QA
documentation work listed by `git status`. This is a local regression baseline,
not evidence for an immutable commit or a remote GitHub Actions run.

All frontend commands used Node 20.20.2 through `fnm`, Corepack, and the
repository-pinned pnpm 9.15.0. The first Corepack bootstrap required approved
network access because `/private/tmp/tradeiq-corepack` was empty. That bootstrap
condition is not a product failure.

The Compose frontend image performed a frozen dependency installation from
`pnpm-lock.yaml` inside its isolated Docker build. Host checks reused the worktree's
existing dependency directory. No dependency or lockfile changed.

## Command results

| Gate | Result | Observed duration | Evidence |
| --- | --- | ---: | --- |
| ESLint | Pass | 2.40 s | Zero errors and zero warnings under `--max-warnings 0` |
| TypeScript | Pass | 4.67 s | `tsc --noEmit` completed without diagnostics |
| Vitest | Pass | 12.32 s test duration; 12.58 s command | 53 files and 347 tests passed |
| V8 coverage run | Pass | 14.51 s test duration; 14.93 s command | Same 53 files and 347 tests passed with coverage enabled |
| Production build | Pass | 7.49 s | TypeScript and Vite production build completed |
| Isolated Compose smoke | Pass | Approximately 31 s after build start | Migrations, seed, services, frontend assets, CORS, public journey and authenticated journey passed |

Canonical frontend commands:

```sh
COREPACK_HOME=/private/tmp/tradeiq-corepack \
  fnm exec --using=20.20.2 corepack pnpm --filter @tradeiq/frontend run lint

COREPACK_HOME=/private/tmp/tradeiq-corepack \
  fnm exec --using=20.20.2 corepack pnpm --filter @tradeiq/frontend run typecheck

COREPACK_HOME=/private/tmp/tradeiq-corepack \
  fnm exec --using=20.20.2 corepack pnpm --filter @tradeiq/frontend run test

COREPACK_HOME=/private/tmp/tradeiq-corepack \
  fnm exec --using=20.20.2 corepack pnpm --filter @tradeiq/frontend run build
```

Coverage was generated without adding artifacts to the worktree:

```sh
COREPACK_HOME=/private/tmp/tradeiq-corepack \
  fnm exec --using=20.20.2 corepack pnpm --filter @tradeiq/frontend exec \
  vitest run --coverage \
  --coverage.reportsDirectory=/private/tmp/tradeiq-frontend-coverage-20260916 \
  --coverage.reporter=text --coverage.reporter=json-summary \
  --coverage.reporter=html
```

The canonical saved QA project existed in a stopped state, so the smoke script's
safety check correctly refused to overwrite it. The passing run used a separate
disposable project and separate ports:

```sh
COREPACK_HOME=/private/tmp/tradeiq-corepack \
SMOKE_PROJECT_NAME=tradeiq-smoke-qa-baseline-20260916 \
SMOKE_KEEP_STACK=0 \
SMOKE_DB_PORT=55443 \
SMOKE_MARKET_PORT=53111 \
SMOKE_AUTH_PORT=53112 \
SMOKE_ML_PORT=58111 \
SMOKE_FRONTEND_PORT=55184 \
  fnm exec --using=20.20.2 corepack pnpm run smoke:compose
```

The disposable project and volume were removed by the script after success. The
stopped `tradeiq-smoke-qa-3ec3040` project and its saved database were preserved.
The smoke logs are in the local temporary directory
`$TMPDIR/tradeiq-smoke-logs/tradeiq-smoke-qa-baseline-20260916`; they are not
durable repository evidence.

## Coverage diagnostic

| Metric | Covered / total | Percentage |
| --- | ---: | ---: |
| Statements | 11,431 / 12,913 | 88.52% |
| Lines | 11,431 / 12,913 | 88.52% |
| Branches | 2,014 / 2,394 | 84.12% |
| Functions | 470 / 590 | 79.66% |

Coverage is diagnostic and is not a release threshold. The current priorities are:

1. **Backtest API client:** `backtestApi.ts` has 2.91% line coverage and no
   exercised functions. Add MSW-backed contract, authorization, failure-mapping,
   submission and status/result tests before relying on unit coverage for the
   authenticated backtest journey.
2. **Backtest status and validation:** `StatusStep.tsx` has 79.00% line and 71.66%
   branch coverage; `validation.ts` has 78.83% line and 84.41% branch coverage.
   Failed, unknown and unauthorized runs plus remaining invalid configurations
   need focused cases.
3. **Authentication/session:** `authed-api.ts` is at 100% for lines, branches and
   functions; `AuthProvider.tsx` is at 90.76% lines and 80% branches. The remaining
   session risks are primarily multi-request, reload and two-tab browser behavior,
   so Phase 3 must not be replaced by more jsdom tests alone.
4. **Paper trading:** the feature is at 95.15% lines. `OrderTicket.tsx` is at
   97.19% lines and 93.38% branches; its API client is at 85% lines and 81.81%
   branches. Browser QA should now target stale estimates, rejection, unavailable
   services and visible reconciliation rather than broad presentation coverage.
5. **Markets and charts:** `SecurityDetailPage.tsx` is at 97.41% lines, while
   `IndexDetailPage.tsx` is at 74.38% lines and 60.52% branches. Chart dimensions,
   scrolling, colour contrast and pointer/keyboard interaction require real layout
   testing because jsdom does not provide meaningful element geometry.

Zero-coverage app entrypoints, type-only modules, and unused generic BoardUI
primitives do not outrank the API, session, validation and financial-state gaps
above.

## Warning classification

No uncaught exception or unhandled promise rejected the suite. Three non-blocking
warning classes remain:

- **React Router v7 future flags:** component tests emit the two documented v6 to
  v7 migration notices. They do not indicate a current test failure, but should be
  resolved when the router migration is scheduled.
- **Recharts zero-size warnings:** chart tests run in jsdom, whose layout boxes are
  zero-sized. Assertions still pass, but these warnings cannot prove browser chart
  geometry. Phase 2 and Phase 5 must validate the rendered charts and contained
  scrolling in Chromium.
- **Vite entry chunk:** the production build reports `index-*.js` at approximately
  587.88 kB minified and 180.63 kB gzip, over Vite's 500 kB warning threshold. This
  is a real performance risk to assess through bundle review and production-like
  Lighthouse measurements; increasing the warning threshold would only hide it.

The failed attempt to reuse the canonical Compose project is also classified: it
was the intended project-exists guard protecting the saved QA database, not a
service or application failure.

## Phase 1 conclusion

Phase 1 passes for the current local worktree. Lint, typecheck, all frontend tests,
coverage execution, the production build, and the isolated cross-service Compose
smoke have no unexplained failures. This does not establish browser accessibility,
responsiveness, session reliability, financial/chart correctness, Lighthouse
scores, cross-browser support, or remote CI status.

The next planned activity is Phase 2: execute the public-route browser,
responsive, theme, metadata, failure-state and Lighthouse matrix against a
production build, retaining durable evidence for the scores and any defects.

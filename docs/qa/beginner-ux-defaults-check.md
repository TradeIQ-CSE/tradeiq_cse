# Beginner UX defaults foundation: validation

Date: 15 September 2026

Branch: `nimesh/frontend-quality-assurance`

Base commit: `3ec30401803e4caa499bd5b246795a91342720dc` plus uncommitted
frontend defaults changes. These results apply to the working tree, not a published
commit or a completed dual-workflow implementation.

## Scope

Complete frontend backtest defaults, coverage-aware date suggestions, draft
restoration without resetting custom settings, and editable practice-account setup
defaults on the paper-trading route. Backend source, algorithms, API contracts,
dependency versions and Compose configuration are unchanged.

## Automated validation

Toolchain: Node 20.20.2 through fnm; repository-pinned pnpm 9.15.0 through Corepack.

| Check | Result |
| --- | --- |
| Frozen-lockfile frontend dependency installation | Passed; no lockfile change |
| Frontend ESLint | Passed |
| Frontend TypeScript check | Passed |
| Full frontend Vitest suite | Passed: 51 files, 310 tests |
| Frontend production build | Passed |
| QA frontend-only Docker rebuild/start | Passed; backend containers not rebuilt/recreated |

Coverage includes fresh complete request defaults, shorter coverage, leap-year
dates, invalid/missing coverage, custom-date preservation, nested legacy defaults,
restored custom payload equivalence, automatic-period intent across serialization,
independent nested defaults and explicit editable account-creation submission.
Existing seven-step workflow and portfolio/order regression tests also pass.

## Warnings and limits

- React Router emits future-flag migration notices; no router migration is part
  of this increment.
- Recharts emits zero-size warnings in jsdom chart tests, which cannot supply real
  browser layout. These tests are not visual chart validation.
- Vite warns about the existing entry chunk exceeding 500 kB. Record this for
  performance QA; passing the build does not establish the Lighthouse target.
- No complete authenticated real-browser walkthrough, cross-browser pass or
  Lighthouse measurement was performed for this increment.
- The three-screen Simple backtest, workflow selector and Simple/Advanced paper
  ticket presentations remain unimplemented. The existing seven-step UI is intact.
- The QA app still uses the isolated small smoke dataset.

# Contributing

Git work for this project is tracked in Linear. Use the Linear project for issue
tracking, GitHub for version control, and the Linear–GitHub integration for
automatic branch, PR, and issue linking.

- Linear team key: **TIQ** (workspace: `nimeshk-personal`)
- GitHub repo: `TradeIQ-CSE/tradeiq_cse` (platform monorepo)
- Dataset-specific work lives in `TradeIQ-CSE/cse-dataset` and follows that
  repo's own CONTRIBUTING.md.

## Quick Reference

| Item | Pattern | Example |
| --- | --- | --- |
| Branch | use the Linear-generated name verbatim | `nimeshk03/tiq-42-db-migrations` |
| Commit | `<type>: <imperative description>` | `fix: correct OHLC bounds validation` |
| Pull request | `<type>: <description> (<LINEAR-ID>)` | `feat: add markets overview API (TIQ-40)` |
| No known ticket | `<type>/<short-description>` (no key) | `chore/update-readme-typo` |

## How Linear Tracks Work

Linear links branches and PRs to issues automatically via the branch name. As
long as the Linear issue ID (e.g. `TIQ-42`) appears in the branch name, Linear
attaches the branch and any PR opened from it to that issue — no special commit
message syntax is required. Linear also mirrors issues to GitHub
(`TradeIQ-CSE/tradeiq_cse`) and syncs their state both ways.

## Branch Naming

Linear generates a branch name for every issue. Always use it verbatim.

Format: `username/identifier-title`

```text
nimeshk03/tiq-42-db-migrations
```

- Copy the exact string from the Linear issue using **Copy git branch name**
  (Cmd+Shift+. on Mac, Ctrl+Shift+. on Windows/Linux) rather than typing it by
  hand. Small deviations silently break the Linear↔GitHub link — no error is
  shown.
- If a piece of work has no Linear issue yet, create the issue first — don't
  branch ahead of it.

## When There Is No Linear Ticket

The Linear ID is only required when the work is tied to a real, existing ticket.

**Never invent or guess an ID.** If no issue number has been provided, omit the
key entirely rather than making one up.

Rules:
- If you know the real issue ID, use it.
- If you do not know the ID, check the Linear board before committing.
- If the work genuinely has no associated ticket (a quick typo fix, a dependency
  bump, a one-line doc correction), commit without an ID. Use the plain pattern:
  `<type>/<short-description>` for the branch and `<type>: <description>` for
  the commit.
- Do not default to the most recently seen ID or any other guess.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) (SRS 3.5.1):

```text
<type>: <imperative description>
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `style`, `test`, `chore`

Rules:
- Write the subject in imperative mood, as if completing "This commit will ...".
- Keep the subject line under about 50 characters where possible.
- No Linear ID needed in the commit message — the branch name handles linking.

Optional direct links in the commit body:
- `Fixes TIQ-42` — only when the commit fully resolves the issue; auto-closes it
  on merge to main.
- `Part of TIQ-42` — for incremental work that does not fully resolve the issue.

Good:
- `feat: add market overview endpoint`
- `fix: correct OHLC bounds validation for 2023 data`
- `test: add simulation engine fixture bars`

Avoid:
- `fixed stuff`
- `update files`
- `WIP`

## Pull Requests

PR titles follow Conventional Commits because squash-merge uses the PR title as
the final commit message on main. Include the Linear issue ID for context:

```text
feat: add market overview endpoint (TIQ-40)
```

PR descriptions should briefly state:
- What changed.
- Why it changed.
- Any test or validation performed.
- A link back to the Linear issue, if one applies.

Example PR description:

```markdown
## Summary
- Adds GET /market/overview with gainers/losers/most-active.
- Wires Redis cache with EOD invalidation.

## Linear
https://linear.app/nimeshk-personal/issue/TIQ-40

## Validation
- `pnpm --filter market-trading test`
- `docker compose up` clean-run verified
```

## Monorepo Ground Rules

- Feature-branch workflow under PR review (SRS 3.5.1). No direct pushes to main.
- `dev` is the default branch and where all feature PRs land. `main` is the
  deployment branch: `dev` is squash-merged into it when cutting a release.
- CodeRabbit reviews PRs into `dev` only. Commits reaching `main` were already
  reviewed on their way into `dev`, so release PRs are left alone — see
  `.coderabbit.yaml`.
- CI must be green before merge: install, lint, typecheck, build, test.
- TypeScript/Node changes: use `pnpm` from the repo root (workspace-managed).
- Python changes (`services/ml-prediction`, `pipeline/data-ingestion`): use `uv`.
- The full stack must stay runnable via a single `docker compose up` — if your
  change adds a service, env var, or migration, update `docker-compose.yml`,
  the owning service's `.env.example`, and the README accordingly.
- Each service owns its database exclusively — no cross-service SQL, ever.
  Cross-service data goes through REST APIs only (SRS 3.6.2).
- Database schema changes come as new migration files in the service's
  `src/db/migrations/`; never edit an applied migration. Nest services apply
  pending migrations automatically at startup — no separate migrate step.
- Never read `process.env` in Nest application code. Add the variable to the
  service's `src/config/env.validation.ts` and a `registerAs` factory under
  `src/config/`, then inject `ConfigService`. (`src/db/data-source.ts` is the
  sanctioned exception: it's TypeORM CLI tooling, not app code.)

## Definition of Done

A ticket is done only after the full Git and Linear flow is complete:

```text
PR opened -> reviewed and approved -> CI checks passing -> merged
```

The person who merges the PR is responsible for moving the matching Linear issue
to Done (the Linear–GitHub sync then closes the GitHub mirror automatically).

No ticket should be closed without going through this flow.

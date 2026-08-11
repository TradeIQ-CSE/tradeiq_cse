# ADR 0005: Frontend data layer — Recharts, TanStack Query, React Router

- **Status:** Accepted
- **Date:** 2026-08-11
- **Source:** IMPLEMENTATION_PLAN.md §0.1 (D5) · Linear TIQ-41

## Context

SRS 3.6.1 pins charting to **Chart.js or Recharts**; the SPA state/data layer is
unspecified by the SRS and left to the team. These were the two remaining
week-1 picks.

## Decision

- **Charting:** Recharts (React-native component API).
- **Server state:** TanStack Query.
- **Routing:** React Router.

All three are already validated by the merged-in-review FE scaffold (PR #19 /
issue #8: `recharts@3.10.1`, `@tanstack/react-query@5.101.4`,
`react-router-dom`).

## Consequences

- One data-fetching pattern (query keys, caching, invalidation) across all
  screens built against `docs/api/endpoint-catalogue-v0.md`.
- Charts sit behind a wrapper component, so the library choice stays isolated
  if ever revisited.
- Chart.js is not used anywhere; no dual charting stacks.

## References

- SRS v1.1 §3.6.1
- FE scaffold PR #19 (issue #8)

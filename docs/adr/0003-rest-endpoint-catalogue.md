# ADR 0003: REST endpoint catalogue as the Phase 1 contract

- **Status:** Accepted
- **Date:** 2026-08-11
- **Source:** IMPLEMENTATION_PLAN.md §0.1 (D3) · Linear TIQ-41

## Context

SRS 3.1.2.1 requires REST APIs spanning auth/users, market data (D/W/M OHLCV,
indices, ratios, dividends, corporate actions), watchlist, portfolios/orders,
rule sets, backtests, analytics, reports, and prediction retrieval; 3.1.3 adds a
public versioned read-only developer API; 3.1.10 adds admin data-ops. FE and BE
need an agreed contract before either builds.

## Decision

Derive the endpoint catalogue from the SRS and adopt it as the Phase 1 contract
deliverable:

- v0 slice (this repo): the four market-data endpoints + shared error envelope —
  `docs/api/endpoint-catalogue-v0.md`, `docs/api/error-envelope.md`.
- The SPA-facing internal API ships **unversioned** in v0; the **public developer
  API is a separate, versioned surface** (SRS 3.1.3) built in Phase 8.
- The catalogue grows per phase; each revision is reviewed before implementation.

## Consequences

- FE (PR #19 scaffold onward) builds against a stable, unambiguous contract.
- Error handling is uniform across services from the first endpoint.
- Changes to the contract are doc-first, reviewable, and versioned in git.

## References

- SRS v1.1 §3.1.2.1–3.1.2.3, §3.1.3, §3.1.10

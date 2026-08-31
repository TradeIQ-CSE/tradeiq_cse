# ADR 0006: ML prediction — integration contract only, model work deferred

- **Status:** Accepted
- **Date:** 2026-08-11
- **Source:** IMPLEMENTATION_PLAN.md §0.1 (D6) · Linear TIQ-41

## Context

The PPO directional-prediction service is owned by **Meelan + Shayan**,
including the notebook handover (`TradeIQ-CSE/cse-dataset` issue #26). This team
makes **no ML design decisions**.

## Decision

Our scope is the **integration contract and surrounding plumbing only**:

- batch-generated predictions, each with `data_as_of`, per-security direction
  (up/down) + confidence;
- explicit **empty state** for uncovered securities — never a low-quality guess;
- disclaimers on every prediction surface;
- hard **fault containment**: a dead ML service degrades no deterministic
  function (SRS 3.3.5).

## Consequences

- SPA and `market-trading` integrate against a stubbed contract; real
  predictions drop in later with zero consumer-side changes.
- Model, training, and evaluation choices are isolated from this codebase's
  design space.

## References

- SRS v1.1 §3.1.9, §3.3.5
- `TradeIQ-CSE/cse-dataset` issue #26

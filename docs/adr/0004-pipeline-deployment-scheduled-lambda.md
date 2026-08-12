# ADR 0004: Pipeline deployment — scheduled, serverless, never resident

- **Status:** Accepted
- **Date:** 2026-08-11
- **Source:** IMPLEMENTATION_PLAN.md §0.1 (D4) · Linear TIQ-41

## Context

SRS 3.1.4.3 requires the data pipeline to run as a **scheduled job, never a
resident service**. The mentor's guidance is to run it serverless — it does not
need to run 24/7.

## Decision

- **Production:** AWS Lambda triggered by an EventBridge schedule, on academic
  credits (SRS 3.6.4).
- **Development/CI:** the same code runs as a container job — `docker compose
  run data-ingestion` locally and as a scheduled GitHub Actions job
  (SRS 3.5.2/3.5.3).
- One artifact, three run modes; the container image is what gets packaged for
  Lambda.

## Consequences

- No always-on pipeline infrastructure to pay for or keep alive.
- Local and CI behaviour matches production semantics (one-shot batch run).
- Cold-start latency is irrelevant for a daily EOD batch.

## References

- SRS v1.1 §3.1.4.3, §3.5.2, §3.5.3, §3.6.4

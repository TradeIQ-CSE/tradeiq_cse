# Structured Error Envelope

| | |
|---|---|
| **Status** | v0 — binding for all TradeIQ CSE APIs |
| **SRS ref (v1.1)** | 3.1.2.3 — *"API requests shall be validated at the boundary; invalid requests shall be rejected with structured error responses identifying the offending fields. Errors shall never expose internal implementation detail."* |
| **Companion doc** | [endpoint-catalogue-v0.md](./endpoint-catalogue-v0.md) |

## 1. Shape

Every non-2xx response from any TradeIQ API is a JSON object with a single
top-level `error` key:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "fields": [
      { "field": "timeframe", "reason": "must be one of: daily, weekly, monthly" },
      { "field": "from", "reason": "must be on or before 'to'" }
    ],
    "trace_id": "01J6Z8Y2K0QF3M4X0T8Y0W3B7R"
  }
}
```

### Fields

| Field | Type | Always present | Semantics |
|---|---|---|---|
| `code` | string | yes | Machine-stable identifier from the registry in §2. **Clients must branch on this, never on `message`.** |
| `message` | string | yes | Short human-readable summary. May be shown to users, may be reworded between releases — not part of the contract |
| `fields` | array | 400 only | One entry per offending input; non-empty on every `VALIDATION_FAILED`. Absent for all other codes |
| `fields[].field` | string | — | The input name: query param, path param, or JSON body path (dot notation for nested body fields) |
| `fields[].reason` | string | — | Why the value was rejected, stated in terms of the expected value only |
| `trace_id` | string | yes | Opaque correlation id matching the service's structured logs. The only diagnostic handle exposed — quote it when reporting bugs |

Success responses never contain `error`; error responses never contain `data`.

## 2. Code registry

| HTTP | Code | `fields` | Meaning | Client guidance |
|---|---|---|---|---|
| 400 | `VALIDATION_FAILED` | required | Boundary validation rejected the request (SRS 3.1.2.3) | Highlight `fields[].field` inputs; do not retry unchanged |
| 401 | `UNAUTHENTICATED` | — | Missing/invalid/expired access token | Trigger re-auth flow |
| 403 | `FORBIDDEN` | — | Authenticated but not allowed (incl. non-admin on admin routes, SRS 3.1.2.2) | Hide the affordance; do not retry |
| 404 | `NOT_FOUND` | — | No resource at this path | Generic fallback 404 |
| 404 | `SECURITY_NOT_FOUND` | — | `{symbol}` matches no security | Show "unknown symbol" state |
| 409 | `CONFLICT` | — | State conflict (e.g. duplicate unique value) | Refresh state, surface message |
| 422 | `BUSINESS_RULE_VIOLATION` | — | Well-formed request rejected by a domain rule (e.g. insufficient buying power) | Surface `message`; no field highlight |
| 429 | `RATE_LIMITED` | — | Quota exceeded (per-key, per-user, or per-IP; model per SRS 3.1.3.3) | Back off until `reset_at` |
| 500 | `INTERNAL` | — | Unexpected server failure | Generic error UI + log `trace_id` |

Endpoint-specific codes (like `SECURITY_NOT_FOUND`) are defined in the owning
endpoint's catalogue section; this registry fixes the shared semantics. New codes
are added here first — reuse an existing code whenever it fits.

### `RATE_LIMITED` extension

429 responses add one field inside `error` and one header:

```json
{ "error": { "code": "RATE_LIMITED", "message": "Rate limit exceeded.",
             "reset_at": "2026-08-11T05:00:00Z", "trace_id": "…" } }
```

- `reset_at` — RFC 3339 UTC instant when the quota window resets (SRS 3.1.3.3
  requires the response to identify the reset time).
- `Retry-After: <seconds>` header mirrors it for HTTP-native clients.

## 3. Non-disclosure rules (SRS 3.1.2.3)

An error response must never contain:

- stack traces, exception class names, or framework internals;
- SQL, ORM errors, table/column names, or migration state;
- file paths, hostnames, IPs, or service topology;
- secret material of any kind (SRS 3.4.6: no secret in any error response);
- the **supplied invalid value** echoed back in `fields[].reason` when doing so
  would leak another user's data or internal state (stating the *expected* shape
  is always safe).

500 responses are always exactly: `code: "INTERNAL"`, a generic `message`, and
`trace_id`. Diagnosis happens server-side via the trace id.

## 4. Implementation note (NestJS services)

For `market-trading` / `identity-auth` this maps to:

- a global `ValidationPipe` (whitelist + transform) enforcing DTO constraints at
  the boundary, its error factory producing `VALIDATION_FAILED` + `fields[]`;
- a single global exception filter translating domain/HTTP exceptions into this
  envelope and attaching `trace_id` from the request-scoped correlation id;
- `ml-prediction` (FastAPI) produces the identical envelope via its exception
  handlers — the contract is service-agnostic.

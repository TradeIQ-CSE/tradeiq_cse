# ADR 0010: Public developer API — placement, storage and rate limiting

- **Status:** Accepted
- **Date:** 2026-09-26
- **Source:** SRS v1.1 §3.1.3, §3.4.3, §3.4.5, §3.4.6, §3.6.1, §3.9.1, §3.10.1
  · SDD Fig. 1, Fig. 5, Fig. 12/13 · `docs/plans/developer-api.md`
- **Contract:** [public-api-v1.md](../api/public-api-v1.md)

## Context

SRS 3.1.3 requires a public, versioned, read-only REST API: key-based
authentication with self-service register/view-usage/regenerate/revoke
(3.1.3.2), a per-key rate limit that states its reset time (3.1.3.3),
pagination on list resources, and hosted reference documentation (3.1.3.4,
3.7.3). The SDD already places this: Fig. 1 (C4) draws "Market Data Service"
hosting the OHLCV API, the public developer API, and backtesting, with Redis
holding "rate-limit counters, response cache (public API, EOD-invalidated)";
Fig. 5 lists Register API Key / View API Usage / Regenerate / Revoke Key as
external-developer use cases; Fig. 12/13 show Market Data Service talking to
Redis directly, with nginx doing only TLS and routing. SRS 3.10.1 places
public-API keys in the market-data store.

The one placement question the SDD leaves open is key management itself: it
is a JWT-authenticated, user-owned resource, which could as easily sit with
`identity-auth` (issuer and owner of the session) as with `market-trading`
(where the SDD already draws the rest of this feature). ADR 0009 settled the
equivalent question for paper trading — draw the boundary at the domain that
must enforce correctness rules, not at the service that issues the token —
and the same reasoning applies here.

## Decision

Everything for the public developer API lives in `market-trading`: the six
read-only public resources, the per-key rate limit, usage recording, and key
management (register / view / regenerate / revoke). This follows SRS 3.10.1,
SDD Fig. 1, and ADR 0009's one-way coupling — `identity-auth` issues the
access token, `market-trading` verifies it locally and reads `user_id` from
the verified claims, exactly as it already does for watchlist and paper
trading. Key management needs no new call to `identity-auth` and no table
shared between the two services.

Supporting decisions:

- **Redis for the hourly counter (SRS 3.6.1); Postgres for daily usage.** The
  counter is disposable and must stay fast under contention; the usage
  history must survive a Redis restart and be queryable by day, so it lives
  in `market_data.api_key_usage` instead of Redis.
- **One active key per user.** SRS 3.1.3.2 says "their key," singular. A
  partial unique index on `api_keys(user_id) WHERE revoked_at IS NULL`
  enforces this at the database, so a race between two concurrent creates
  can never leave a user with two active keys.
- **Fixed clock-hour window, not a sliding one.** SRS 3.1.3.3 requires the
  response to state the reset time. A fixed window's reset time is always
  the start of the next UTC hour, independent of request pattern; a sliding
  window's reset time depends on request history and is harder to state in
  a single header value.
- **Key format `tiq_<40 base62 chars>`, hashed with SHA-256.** 40 base62
  characters is roughly 238 bits of entropy — nothing to brute-force from a
  hash. A fast hash is the right trade-off here: unlike a password, which is
  checked rarely and must resist offline guessing over a small human-chosen
  space, an API key is checked on every request and drawn from a space large
  enough that speed carries no risk. The secret itself is never stored or
  logged; only its hash and an 8-character display prefix are kept.
- **Fail open on a Redis outage.** A request the limiter can't check is
  still served, and the failure is logged. A counter outage must not take a
  read-only public API down; nginx's per-IP limit still bounds the abuse
  case in the meantime.
- **CORS `*` on the public `GET` routes only.** The key travels in a header,
  never a cookie, so unlike cookie-based auth there is nothing on this
  surface for another origin's script to borrow.
- **`owner_email` dropped from `api_keys`.** SRS 3.4.6 requires email
  addresses to be stored only encrypted, with a blind index, and §3.10 says
  no plaintext personal identifier is stored; `owner_email` would be a
  plaintext copy. `user_id` is enough to resolve the owner through
  `identity-auth` if it is ever needed; `key_prefix` is added in its place,
  for the `GET /developer/key` display value.

## Consequences

- Redis becomes new infrastructure: a container in dev, smoke, CI and
  production, and with it a new failure mode the fail-open rule must cover.
  Redis is not in the stack today.
- No response cache yet, despite the SDD mentioning one for the public API.
  The seeded reads already meet the 500 ms target (SRS 3.4.2) without it; a
  cache is added later only if measurement asks for it.
- The email-verification gate SRS 3.1.1.2 implies for unverified accounts is
  deferred, because verification itself isn't built yet — any signed-in user
  can create a key today. When verification ships, key creation gains a
  check on the access token's `email_verified` claim.
- Keys belonging to a deleted account have no cleanup path yet:
  `market_data.api_keys.user_id` has no foreign key to `auth.users` (ADR
  0009) and there is no cross-service cascade. A deleted account's key keeps
  working until account deletion and this cleanup are both built.
- `market-trading`'s public surface never calls `identity-auth` at request
  time, so `identity-auth`'s availability has no effect on the public API —
  the same benefit ADR 0009's one-way coupling already gives paper trading.

## Alternatives considered

- **Key management in `identity-auth`.** Rejected: if keys lived in
  `identity-auth`, `market-trading` would have to ask `identity-auth` to
  validate the key on every public request, or read `identity-auth`'s table
  directly. ADR 0009 already rejected both kinds of coupling for paper
  trading, for the same reason: this is a path market-trading must be able
  to serve correctly on its own, not one that depends on a network call or
  another service's schema.
- **Per-IP limiting only.** Rejected: SRS 3.1.3.3 and 3.4.5 require the
  limit to be per key, not per IP. A shared office or NAT would otherwise
  throttle every developer behind it together, and one abusive key would be
  indistinguishable from its well-behaved neighbours.
- **Sliding window.** Rejected: harder to state a single `reset_at` for (see
  Decision, above), and the fixed 100/hour baseline SRS 3.1.3.3 asks for
  doesn't call for the smoothing a sliding window buys.

## References

- SRS v1.1 §3.1.3, §3.4.3, §3.4.5, §3.4.6, §3.6.1, §3.9.1, §3.10.1
- SDD Fig. 1 (C4), Fig. 5 (use cases), Fig. 12/13
- [ADR 0009: `market-trading` owns paper trading](./0009-market-trading-owns-paper-trading.md)
- [Public developer API v1](../api/public-api-v1.md)
- `docs/plans/developer-api.md`

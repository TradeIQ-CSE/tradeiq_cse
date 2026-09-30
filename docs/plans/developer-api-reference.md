# Developer API reference: context and implementation plan

Prepared on 2026-09-30. Planning only; no application, API, infrastructure, or deployment changes have been made for this task.

## Findings and evidence

The public API and a generated Swagger reference already exist. The immediate failure is production routing: the intended public API prefix is reaching the React application instead of the API service.

The Developers page's Full API reference button uses `PUBLIC_API_DOCS_URL`, currently `https://tradeiqcse.tech/api/public/v1/docs`. It is a normal external anchor. The React wildcard route redirects unknown paths to `/markets`; this is what happens when nginx sends the docs request to the frontend.

Read-only HTTP checks on 2026-09-30:

| Request | Observed response |
|---|---|
| Local `/public/v1/docs` | 200, Swagger HTML; browser displays all six operations |
| Local `/public/v1/openapi.json` | 200, valid OpenAPI 3.0 JSON, six paths and 29 schemas |
| Local `/public/v1/securities`, without key | 401 JSON, `UNAUTHENTICATED` |
| Production `/api/public/v1/docs` | 200, frontend HTML; browser navigates to `/markets` |
| Production `/api/public/v1/openapi.json` | 200, frontend HTML rather than JSON |
| Production `/api/public/v1/securities`, without key | 200, frontend HTML rather than 401 JSON |
| Production `/api/public/v1/docs/swagger-ui-init.js` | 200, frontend HTML rather than JavaScript |
| Production `/api/market/public/v1/docs` | 200, Swagger HTML |
| Production `/api/market/public/v1/openapi.json` | 200, OpenAPI JSON containing the six public paths |
| Production `/api/market/public/v1/securities`, without key | 401 JSON, `UNAUTHENTICATED` |

The working `/api/market/public/...` paths establish that the public controllers and documentation are deployed. They are diagnostic evidence, not the intended external API address.

`deploy/nginx/common.conf` already contains the intended `/api/public/` location, rewriting it to `/public/` on `market-trading:3001`. The deployment script updates the checkout and runs Compose, but does not explicitly refresh nginx after file content changes. The nginx entrypoint also has a six-hour reload loop. Production Compose mounts individual config files. A stale loaded or mounted nginx configuration is a plausible explanation, but the effective production config, mounts, and deployed checkout have not been inspected; the exact cause remains unconfirmed.

## Requirements and source of truth

The submitted SRS, sections 3.1.3 and 3.7.3, requires a separate, versioned, read-only API, self-service keys and usage, a baseline 100 requests per hour per key, pagination, and hosted documentation containing resource descriptions, parameters, response schemas, and worked examples. Those relevant SRS pages were read directly.

Use these sources together:

- Binding contract: [`docs/api/public-api-v1.md`](../api/public-api-v1.md).
- Architecture and known constraints: [`docs/adr/0010-public-developer-api.md`](../adr/0010-public-developer-api.md).
- Runtime routes and validation: `services/market-trading/src/public-api/`, including its controllers, services, DTOs, guard, and limiter.
- Generated reference: `services/market-trading/src/public-api/openapi/public-api-docs.ts` and `schemas.ts`.
- Current website journeys: `frontend/src/features/landing/DevelopersPage.tsx`, `frontend/src/pages/investor/ApiKey.tsx`, and `frontend/src/features/developer-api/`.
- Routing and deployment: `deploy/nginx/`, `deploy/tradeiq-deploy.sh`, and `docker-compose.prod.yml`.
- Existing verification: `test/public-api-docs.e2e-spec.ts`, `test/public-api.e2e-spec.ts`, documented-bounds tests, guard/limiter tests, and public response identifier tests in `services/market-trading`.

The earlier `docs/plans/developer-api.md` is a pre-implementation plan from September 26. It contains historical statements, such as Redis not being in the stack and key management living in Settings. The current implementation includes Redis and a dedicated `/api-key` page. Preserve that historical plan; use verified runtime behavior for this reference.

## Current external API

Canonical base URL: `https://tradeiqcse.tech/api/public/v1`.

All six resources are GET requests. The service owns market data in PostgreSQL, resolves keys locally, uses Redis for the hourly counter, and records daily usage in PostgreSQL. Identity-auth is not called on each public request.

| Resource | Purpose and filters | Pagination default / maximum |
|---|---|---|
| `/securities` | Descriptive security list; optional `search` and known GICS `sector` | 50 / 200 |
| `/securities/{symbol}` | One security's descriptive attributes; no current price object | Not paginated |
| `/securities/{symbol}/ohlcv` | Daily, weekly, or monthly bars; `timeframe`, inclusive `from` and `to` | 500 / 1000 bars |
| `/indices` | Index descriptions with each index's own latest available close and change | 50 / 200 |
| `/indices/{code}/values` | One index's daily close series; inclusive `from` and `to` | 500 / 1000 values |
| `/eod` | OHLCV and change across securities for an exact session; optional `date` | 200 / 500 |

All paginated resources use `page` >= 1, default 1, and `page_size` >= 1. `meta.total` counts the matching rows, bars, or values across pages. A page beyond the result set is a successful empty result.

### Authentication and keys

- Reads require `X-API-Key`; query-string keys and website JWTs are not the authentication method for these resources.
- Keys have the shape `tiq_` plus 40 base62 characters. Missing, malformed, unknown, and revoked keys receive the same 401 `UNAUTHENTICATED` envelope.
- The website's `/api-key` page supports create, usage, regenerate, and revoke for the signed-in user. One key can be active per user. The full secret is shown only when created or regenerated; storage contains its hash and display prefix.
- Key management uses JWT-authenticated `/api/market/developer/key`, `/developer/key/regenerate`, and `/developer/usage`. These are internal website endpoints and must remain outside the external reference's endpoint catalogue and OpenAPI document.
- Daily usage spans 30 UTC dates; the current-hour count can be unavailable when Redis is down.
- Accepted ADR constraints include deferred email verification and deleted-account key cleanup. Key revocation invalidates the current instance's positive cache immediately; another instance can retain a positive cache entry until its bounded 60-second TTL. Avoid publishing a stronger cross-replica guarantee than the implementation provides.

### Quota and errors

- Baseline quota is 100 requests per key per UTC clock hour, configurable with `PUBLIC_API_HOURLY_LIMIT`. Reset is the next UTC hour, rather than an hour after the first request.
- Requests resolving to an active key count, including validation failures and not-found results. Requests rejected before resolving a key do not use its quota.
- Authenticated responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. Over-quota responses are 429 `RATE_LIMITED`, with `Retry-After` seconds and `error.reset_at`.
- Redis failure allows the read to proceed and omits the remaining-count header. The nginx per-IP limit is independent and can also return 429; its response need not have the per-key reset fields.
- Document structured 400 `VALIDATION_FAILED`, 401 `UNAUTHENTICATED`, 404 `SECURITY_NOT_FOUND` / `INDEX_NOT_FOUND`, and 429 `RATE_LIMITED`, including correlation `trace_id` and validation `fields` where applicable.
- Public GET resources support any CORS origin, an uncounted key-free OPTIONS preflight, `X-API-Key`, and exposed quota / retry headers.
- Documentation and the raw spec are key-free and do not consume the per-key quota. Actual requests made through Swagger do consume quota.

### Data conventions that the reference must explain

- This API exposes historical and latest available end-of-day data. Do not promise intraday quotes, today's data, or a freshness SLA that is not implemented.
- Dates are `YYYY-MM-DD`; timestamps and quota resets are RFC 3339 UTC. Prices and percentages are JSON numbers, volumes and share counts are integers. Percentages use percentage units: `0.47` means 0.47%, not 47%.
- Inputs match symbols and index codes case-insensitively; responses use their canonical forms. Both path values have runtime length bounds of 1-20 characters.
- List search matches a symbol prefix or company-name substring, case-insensitively; `%` and `_` are treated literally. Search length is 1-100. Sector must be a known GICS code.
- Coverage, sector, shares outstanding, opening price, previous-value changes, and latest index values can be null as defined by their schemas. Null means unavailable, rather than zero.
- OHLCV defaults to daily. Its end date defaults to the latest available market session and its start to one calendar year earlier. Index series default their end to the latest date available across indices, not necessarily that index's last observation.
- Daily bars use `date`. Weekly and monthly bars use `period_start` / `period_end`; aggregates cover only daily observations inside the requested range, so boundary periods can be partial. Aggregate open is the earliest available non-null open inside the period.
- Series are ascending; missing dates are not filled or carried forward. Index series are close-only. Public OHLCV does not expose the internal `adjusted_close` field.
- Empty series return 200 with empty `bars` or `values`. An explicit EOD date without a session returns 200 with empty `data`, total 0, and `as_of: null`; it does not silently choose a previous session.
- Public responses identify securities by symbol and indices by code; internal UUIDs are excluded.
- v1 changes are additive. Breaking contract changes require a parallel v2.

## Recommended reference experience

Create a public `/developers/reference` route. Keep `/developers` as the concise introduction and quick start, and `/api-key` as the authenticated console. Full API reference should open the new reference route as ordinary site navigation. Retain the existing hosted Swagger UI as a separately labelled interactive explorer, and expose a raw OpenAPI download link.

Use the existing BoardUI components, semantic colors, typography, theme support, and translations. A compact documentation layout is better suited to reference material than the landing page's large promotional cards:

- Desktop: a navigation column, readable documentation content, and request / response examples alongside the relevant operation where space allows.
- Mobile: a collapsible contents control and stacked sections; wide code and schema content scroll within their own containers, without widening the page.
- Navigation: overview, authentication and keys, rate limits, pagination and dates, Securities, Indices, End of day, errors, and versioning. Give every section and operation a stable deep link.
- Each operation: GET badge and path, purpose, parameter table with defaults / bounds, response fields with types / nullability, response example, applicable errors, and relevant data notes.
- Examples: copyable curl, Python, and JavaScript requests using `YOUR_KEY`, explicit example dates where helpful, pagination examples, and response JSON clearly labelled as illustrative.
- Interactive exploration: use the existing Swagger UI initially rather than duplicating a request console. Explain that Execute sends a real quota-counted request, keep authorization persistence disabled, and do not automatically transfer the website's key into the explorer.
- Accessibility: keyboard navigation, visible focus, correct headings / table headers, accessible copy labels, and a skip link. Check light and dark themes as well as narrow widths.

Use generated OpenAPI for operation, parameter, response, and schema details. Keep human-written guides and operation notes alongside it, keyed to stable operations or paths. Produce a deterministic generated spec artifact through the existing backend test/export environment for the frontend build, and validate it against the live generated document in CI. This allows the reference to remain readable if the API is temporarily unavailable and avoids maintaining a second handwritten schema catalogue. Do not use private endpoints or database fixtures as browser-facing example data.

## Documentation gaps to resolve

1. Path parameter schemas omit explicit string types and the runtime 1-20 character bounds for symbol and code.
2. Security detail can return validation 400 for an oversized symbol, but its OpenAPI responses do not document that status. Cover the same bound in the OHLCV operation's validation description.
3. Authenticated 400 and 404 responses carry quota headers at runtime, but those headers are missing from their response definitions.
4. Date parameters should explicitly describe valid calendar-date formatting. Current parameter schemas use strings without a date format.
5. Explain both per-key and edge 429 shapes; do not imply `reset_at` exists on every possible 429.
6. The generated Swagger server list is production-only, including when served locally. Make environment selection explicit so local tests do not accidentally send requests to production.
7. The introductory description hardcodes 100 per hour although runtime configuration can differ. Describe this as the default and treat response headers as authoritative.
8. Add worked examples and narrative guidance beyond the current brief Swagger operation summaries, including partial aggregates, empty results, nulls, and pagination.

These are documentation and deployment corrections; the plan does not add new external endpoints or change v1 validation behavior.

## Implementation sequence

1. **Restore canonical production routing.** Inspect the deployed revision, nginx's effective `nginx -T` output, and mounted config contents. Compare with repository routing, then choose the appropriate validated config reload or container recreation. Make config updates reliably take effect in the deploy flow, accounting for individual file bind mounts. Do not replace the canonical public base URL with the diagnostic market-prefixed address.
2. **Reconcile the generated contract.** Correct the metadata gaps above; preserve the six-path scope and key-free docs. Establish deterministic spec generation and a drift check using the existing PostgreSQL / Redis CI environment. Update the contract notes only where needed to describe already implemented behavior accurately.
3. **Build the public reference page.** Add the public lazy route, documentation shell, generated endpoint/schema views, stable anchors, guides, examples, translations, and loading/error handling appropriate to the spec source. Keep the page available to signed-out visitors.
4. **Connect developer journeys.** Point Full API reference to the new route. Add clear links among the quick start, reference, key console, Swagger explorer, and raw OpenAPI document. Keep examples on the canonical API base URL.
5. **Verify behavior and presentation.** Run targeted backend docs/bounds and frontend checks, plus browser verification and an edge-routing regression check. Deploy only as a separate authorized implementation step.

## Acceptance checks for implementation

- Canonical production docs return Swagger HTML; the spec returns JSON with the correct content type; Swagger JS/CSS return the expected asset types. The public no-key securities read returns JSON 401 rather than frontend HTML.
- Reference navigation, direct loading, refresh, and deep links stay on the reference, never fall through to Markets. Signed-out readers can access it.
- Exactly six external operations appear, with `X-API-Key` security and accurate parameter bounds, schemas, nullability, examples, and errors. Key-management, backtesting, paper trading, ingestion, and internal market routes do not enter the generated spec.
- Existing public-API tests continue to cover authentication, quota/reset behavior, CORS, pagination, identifiers, empty ranges, and exact-date EOD behavior. Extend focused tests for metadata gaps rather than duplicating all runtime tests.
- Add a proxy-level check through nginx. Existing direct Nest documentation tests cannot catch the observed production SPA fallback. A deploy smoke check must inspect content types and body shape, not merely status 200.
- Test curl examples and representative responses against isolated local fixtures with a disposable test key; label examples honestly. Avoid using production account keys or consuming production quota during routine checks.
- Browser checks at approximately 360/390, 768, and 1440 pixels, light and dark themes, keyboard navigation, copy controls, mobile contents, and contained code overflow.
- Verify no key enters a URL, generated artifact, persistent browser storage, analytics event, or log. Swagger authorization remains memory-only.

Current investigation used source review, local/production HTTP reads, and read-only browser inspection. No API key was created, regenerated, revoked, or used; no implementation test suite was run for this planning task. Existing frontend edits, saved plans, data, and the running development app were preserved.

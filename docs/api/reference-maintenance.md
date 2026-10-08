# Public developer API reference maintenance

The website reference at `/developers/reference` is public and uses a bundled, deterministic OpenAPI artifact. Its endpoint details are reflected from the six actual public controllers and their DTO/response decorators. Paired worked requests and responses come from backend operation metadata in `worked-examples.ts`; the frontend holds narrative guidance keyed by stable paths and renders the selected generated example. It never calls the API or asks for a real key to render the documentation.

## Updating the contract

1. Change public-controller documentation or response metadata alongside the relevant runtime change. v1 compatibility rules still apply; this documentation work does not change runtime validation.
2. Run `pnpm --dir services/market-trading run api:reference:generate` at the repository root. This reflects the actual controllers with service/guard/interceptor fixtures, without contacting PostgreSQL or Redis. Commit `frontend/src/features/developer-api/generated/public-api.json` with the metadata change.
3. Run `pnpm --dir services/market-trading run api:reference:check`. CI fails when the artifact differs. `public-api-docs.e2e-spec.ts` also compares the real application’s generated document to the artifact (environment-specific server prefixes are normalized).
4. Update English and Sinhala `apiReference` guides and operation notes if the meaning changes. Source-generated technical descriptions retain English and are marked with `lang="en"`; the page tells readers this explicitly.
5. Check links, deep links, keyboard use, code copies, and tables at narrow widths, plus both themes. Request examples must use placeholders or environment variables and canonical public URLs, never saved keys.

Swagger chooses the current origin: `/` for direct local development and `/api` in production, where nginx exposes `/api/public/v1`. Authorization persistence is explicitly disabled. The generated artifact normalizes the server to `/api`, so it can be served on the production origin or downloaded without embedding credentials or an environment-specific host. The branded reference uses local API explorer/spec links under Vite development, and same-origin `/api/public/v1` links in production; `VITE_PUBLIC_API_BASE_URL` optionally overrides the documentation base for a preview with a different proxy. Request examples retain the canonical production base URL. The reference links separately to hosted Swagger and the raw JSON specification; it does not transfer a key to either.

## Canonical nginx routing and recovery

A direct API health check cannot detect the original incident: `/api/public/v1/docs`, its assets, the JSON spec, and resource reads received frontend HTML with status 200, then React redirected unknown paths to Markets. The canonical proxy must strip `/api` and retain `/public/v1` on `market-trading:3001`.

Production uses server-owned nginx configuration under `/opt/tradeiq/deploy/nginx`.
The application repository keeps shared routing rules under `config/nginx`, with
isolated proxy tests. Updating source routing rules does not automatically replace
server configuration; an operator validates and applies those changes separately.

From `/opt/tradeiq`, inspect the current selection and run the read-only checks:

```sh
cat .state/current-release
bin/deploy.sh --check
```

For effective nginx configuration, use the Compose helper in
[Deployment](../ops/deployment.md) and run `compose exec -T nginx nginx -T`.
Compare the `/api/public/` location with `config/nginx/common.conf` in the
application checkout and the server's mounted `deploy/nginx/common.conf`.

After updating server configuration, `bin/deploy.sh --apply-current` tests the
candidate, reapplies the selected application images, recreates nginx with fresh
mounts, and checks the external docs/spec/assets/resource responses. It preserves
the database, Redis and certificate containers. On failure, the helper reapplies
the previous image selection; a configuration edit itself must be restored from
its operator backup if it caused the failure.

The canonical public address remains `/api/public/v1`.

## Verification

- `node --test scripts/public-api-smoke.test.mjs` checks that frontend HTML 200 cannot be accepted as docs/spec success.
- `bash scripts/public-api-proxy-test.sh` creates its own disposable Docker network and two containers, using strict upstream fixtures and the **shared repository nginx routing rules and a test-only server configuration**. It checks docs HTML, exact six-path spec JSON, correct CSS/JS content types, and key-free JSON 401, then proves an incorrect prefix reaching the SPA fallback is rejected. It does not contact saved PostgreSQL/Redis or production. Set `PUBLIC_API_PROXY_TEST_PORT` if port 55987 is occupied.
- `node scripts/public-api-smoke.mjs <base-url>` can probe a deployed proxy; default is `https://tradeiqcse.tech/api/public/v1`. No key is supplied or generated. Direct local comparison uses `http://localhost:3001/public/v1`.
- Backend public-API e2e tests require disposable PostgreSQL/Redis (or the isolated CI services). Do not point mutation tests at the saved developer database. They cover actual keys, quotas, CORS, validation, identifiers, aggregation, paging, and empty results; the docs e2e verifies the served contract matches the artifact.
- `schema-fidelity.spec.ts` validates emitted response schemas with AJV, including nullable objects, malformed present objects, both external 429 shapes, and all thirteen paired examples' pagination/range invariants.
- `public-api-examples.e2e-spec.ts` runs only with `PUBLIC_API_REFERENCE_FIXTURE_TESTS=1` against an **empty disposable database**. It refuses to seed a database containing securities or indices. It seeds illustrative public-symbol observations and a disposable key, executes all thirteen generated request paths through curl and the application adapter, validates response schemas, and checks exact response equality. CI runs it before importing the bundled sample. Keep this explicit opt-in off for saved development data.

Production repair remains an operator/deployment step. Repository implementation and isolated proxy tests do not establish that the live service has been updated.

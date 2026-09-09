# Authentication and Session Contract v1

| | |
|---|---|
| **Status** | Proposed for review — binding after TIQ-75 approval |
| **Owner** | `identity-auth` |
| **Linear / GitHub** | TIQ-75 / issue #66 (also closes issue #55) |
| **Error format** | [error-envelope.md](./error-envelope.md) |
| **SRS refs (v1.1)** | 3.1.2.1 (auth/users APIs), 3.1.2.2 (roles), 3.1.2.3 (boundary validation), 3.4.6 (secrets) |

## 1. Scope

This contract defines how a client obtains, uses and renews credentials for the
TradeIQ SPA. Every other internal endpoint — portfolios, orders, fills — already
requires `Authorization: Bearer <access token>` per
[paper-trading-v1.md §1](./paper-trading-v1.md); this document specifies where that
token comes from.

`identity-auth` owns users and sessions in the `auth` database
([ADR 0009](../adr/0009-market-trading-owns-paper-trading.md)). It is the only
service that authenticates credentials and the only one that issues tokens, and
no other service reads `auth.users`.

Verifying an access token is separate from issuing one. Any guarded service
checks the signature and claims itself, against a public key it is given — today
that is `market-trading`, on every paper-trading and backtest route. It takes the
`user_id` from the verified claims and never calls back to `identity-auth` to do
so, and it holds no key that could sign a token of its own.

Out of scope for v1: email verification and password reset (the `auth.email_tokens`
table exists but has no mail provider behind it), OAuth/social login, multi-factor
authentication, and the public developer API's separate API-key surface (SRS 3.1.3,
Phase 8).

## 2. Token model

Two credentials with deliberately different properties:

| | Access token | Refresh token |
|---|---|---|
| Format | JWT, RS256 | Opaque 256-bit random value, base64url |
| Lifetime | 5 minutes (`AUTH_ACCESS_TOKEN_TTL`) | 15 days (`AUTH_REFRESH_TOKEN_TTL`) |
| Transport | JSON response body | `Set-Cookie`, `HttpOnly` |
| Client storage | Memory only — never `localStorage` | Cookie jar; unreadable to JavaScript |
| Server state | None; verified by signature | Row in `auth.refresh_tokens` |
| Revocable | No — it simply expires | Yes, immediately |

The split is the point. The access token is stateless and cheap to verify on every
request, so it is kept short-lived because it cannot be withdrawn. The refresh token
is long-lived but revocable, and never exposed to page JavaScript.

`identity-auth` holds the RS256 private key and is the only thing in the system
that can mint an access token. Every other service is given the public half and
can do nothing but check a signature, so a read-only disclosure of a verifier's
environment yields no ability to impersonate anyone. The token header names the
key it was signed with:

```json
{ "alg": "RS256", "typ": "JWT", "kid": "<base64url sha256 of the SPKI DER>" }
```

`kid` is derived from the key rather than configured beside it, so the two
cannot drift apart. A verifier looks the value up in the keys it was given and
refuses the token when it names one it does not hold — the `kid` chooses among
configured keys, it is never itself trusted. `alg` is likewise pinned to RS256
rather than read from the token: a verifier that honoured the header would
accept the same token re-signed HS256 with the published public key as the
HMAC secret, which is the whole authority the split was made to remove.

### 2.1 Access token claims

```json
{ "sub": "<user uuid>", "role": "investor", "iss": "tradeiq-identity-auth",
  "aud": "tradeiq-spa", "iat": 1788200000, "exp": 1788200300 }
```

`sub` is the only identity input the API trusts. A token without an `exp` claim is
rejected — absence of expiry is treated as invalid, not as "never expires".

`role` is the only authorization input, and it is read strictly: **only the exact
string `admin` grants admin.** A missing, differently cased, misspelt or
non-string claim is an investor. Nothing outside the signed token can grant it —
not a header, query parameter or body field. Guarded services expose this as an
`AdminGuard`, which answers `403 FORBIDDEN` rather than `401`: the caller is
authenticated, just not permitted, so re-authenticating would not help.

A role change takes effect on the **next** access token, not immediately.
`POST /auth/refresh` re-reads the user inside the rotation transaction, so a
refreshed token always carries the current role — but an access token already in
a client's hands keeps the old one until it expires. The access-token TTL
(`AUTH_ACCESS_TOKEN_TTL`, 5 minutes) is therefore the window in which a demoted
admin retains admin access. Revoking the user's refresh tokens shortens nothing
inside that window; it only prevents the next rotation.

### 2.2 Refresh cookie

```
Set-Cookie: refresh_token=<opaque>; HttpOnly; Secure; SameSite=Lax;
            Path=/auth; Max-Age=1296000
```

`Secure` is controlled by `AUTH_REFRESH_COOKIE_SECURE` so local HTTP development
works; it must be `true` in every deployed environment. `Path=/auth` keeps the
cookie off every other endpoint, so it is never sent with ordinary API traffic.

Only `sha256(token)` is stored. A database disclosure therefore yields no usable
session — the same reasoning that applies to `password_hash`.

## 3. Rotation and reuse detection

Every successful refresh **rotates**: the presented token is marked used and a new
one is issued. Tokens descended from one login share a `family_id`.

A token is accepted only when it is unexpired, not revoked, and **not already used**.

Presenting an already-used token means two parties hold the same credential — the
legitimate client and someone who copied it. The server cannot tell which is which,
so it revokes **the entire family** and forces re-login. A stolen refresh token is
therefore usable at most once, and its use permanently locks out the session it
came from, which the real user notices immediately.

Detection and revocation happen in one transaction, holding a lock on the family.
Otherwise a refresh of the still-live successor could slip in between the two and
collect an access token that outlives the revocation by its full lifetime.

This is the answer to "what if a token is stolen": the access token expires within
five minutes, and the refresh token self-destructs on the second use.

## 4. Endpoints

All paths are served by `identity-auth`. `POST /auth/signup`, `POST /auth/login` and
`POST /auth/refresh` carry no guard; `POST /auth/logout` and `GET /auth/me` require a
valid access token.

### 4.1 `POST /auth/signup`

```json
{ "email": "ama@example.lk", "password": "correct horse battery staple",
  "display_name": "Ama Perera", "language_pref": "en" }
```

`password` is 12–128 characters. `language_pref` is one of `en`, `ta`, `si` and
defaults to `en`. `role` cannot be set by a client; every signup is an `investor`.

Responds `201` with the §4.6 session body. An email already registered returns
`409 EMAIL_ALREADY_REGISTERED`.

### 4.2 `POST /auth/login`

```json
{ "email": "ama@example.lk", "password": "correct horse battery staple" }
```

Responds `200` with the §4.6 session body.

An unknown email and a wrong password both return `401 INVALID_CREDENTIALS` with an
identical body, and the endpoint does the password-verification work either way, so
neither the response nor its timing reveals whether an account exists.

### 4.3 `POST /auth/refresh`

Takes no body; the credential is the `refresh_token` cookie. Responds `200` with the
§4.6 session body and a fresh cookie.

Missing, expired, revoked, unknown or already-used tokens all return
`401 REFRESH_TOKEN_INVALID`. Per §3, the already-used case also revokes the family.

### 4.4 `POST /auth/logout`

Requires an access token. Revokes the whole family of the presented refresh cookie
and clears it. Responds `204`. Idempotent: logging out twice still returns `204`.

### 4.5 `GET /auth/me`

Requires an access token.

```json
{ "data": { "user_id": "…", "email": "ama@example.lk", "display_name": "Ama Perera",
            "role": "investor", "language_pref": "en", "email_verified": false } }
```

This is the only endpoint that decrypts and returns an email address, and only ever
the caller's own.

### 4.6 Session response body

```json
{ "data": { "access_token": "eyJhbGciOiJIUzI1NiIs…", "token_type": "Bearer",
            "expires_in": 300,
            "user": { "user_id": "…", "display_name": "Ama Perera", "role": "investor" } } }
```

`expires_in` is seconds. The refresh token is **never** in the body — it exists only
in the `Set-Cookie` header.

## 5. Email storage

`auth.users` stores no plaintext email:

- `email_encrypted` — AES-256-GCM under `AUTH_EMAIL_ENCRYPTION_KEY`, storing IV,
  auth tag and ciphertext together. Reversible, because §4.5 must return the address.
- `email_hash` — HMAC-SHA256 of the lowercased, trimmed address under the same key.
  Deterministic, so login and the `UNIQUE` constraint can match an address without
  decrypting anything. Keyed rather than plain SHA-256, so an attacker holding only
  the table cannot confirm a guessed address.

Login normalises the input, computes the HMAC, and looks up by `email_hash`.

## 6. Error codes

Shared codes come from [error-envelope.md §2](./error-envelope.md). This contract
adds three endpoint-specific codes:

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Email/password combination not recognised. Never distinguishes which was wrong. |
| 401 | `REFRESH_TOKEN_INVALID` | Refresh cookie missing, expired, revoked, unknown or replayed. |
| 409 | `EMAIL_ALREADY_REGISTERED` | Signup for an address that already has an account. |

`UNAUTHENTICATED` keeps its existing meaning — a missing or invalid *access* token
on a guarded route — and is what `JwtAuthGuard` raises.

## 7. Worked examples

These are the test vectors; `test/auth.e2e-spec.ts` asserts against them. They
are transcribed from a local run, so the cookies below carry no `Secure` — the
tests set `AUTH_REFRESH_COOKIE_SECURE=false` because a Secure cookie is dropped
over plain HTTP. Every deployed environment sends it, as in §2.2.

### 7.1 Signup then use the session

```http
POST /auth/signup
{"email":"ama@example.lk","password":"correct horse battery staple","display_name":"Ama Perera"}

201 Created
Set-Cookie: refresh_token=Yk9s…; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=1296000
{"data":{"access_token":"eyJ…","token_type":"Bearer","expires_in":300,
         "user":{"user_id":"3f1c…","display_name":"Ama Perera","role":"investor"}}}
```

```http
GET /portfolios
Authorization: Bearer eyJ…

200 OK
```

### 7.2 Refresh rotates the cookie

```http
POST /auth/refresh
Cookie: refresh_token=Yk9s…

200 OK
Set-Cookie: refresh_token=Qp2v…; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=1296000
{"data":{"access_token":"eyJ…","token_type":"Bearer","expires_in":300, "user":{…}}}
```

### 7.3 Replaying a used token kills the family

```http
POST /auth/refresh
Cookie: refresh_token=Yk9s…          # already exchanged in 7.2

401 Unauthorized
{"error":{"code":"REFRESH_TOKEN_INVALID","message":"Refresh token is not valid.",
          "trace_id":"…"}}
```

The current token `Qp2v…` is now revoked too, so the honest client's next refresh
also returns `401` and it must log in again.

### 7.4 Wrong password is indistinguishable from unknown account

```http
POST /auth/login
{"email":"nobody@example.lk","password":"whatever"}

401 Unauthorized
{"error":{"code":"INVALID_CREDENTIALS","message":"Email or password is incorrect.",
          "trace_id":"…"}}
```

Byte-identical to the response for a real account with the wrong password.

## 8. Configuration

| Variable | Default | Notes |
|---|---|---|
| `AUTH_JWT_PRIVATE_KEY` | — | Required. The RS256 key access tokens are signed with: a base64-encoded PKCS#8 PEM holding an RSA private key of at least 2048 bits. It belongs to this service alone — a verifier is given the public half instead. A malformed, undersized or non-RSA value is refused at boot in every environment; the keypair published in `.env.example` is refused additionally under `NODE_ENV=production`. |
| `AUTH_JWT_PUBLIC_KEYS` | — | A comma-separated list of base64-encoded SPKI PEMs. **Required in `market-trading`**, which has nothing else to verify with. **Optional here**, where the signing key's own public half is always accepted without being listed: set it only during a rotation, so `GET /auth/me` keeps accepting tokens signed with the outgoing key. Same boot-time checks as above, plus a rejection of the same key listed twice. |
| `AUTH_ACCESS_TOKEN_TTL` | `5m` | `expiresIn` on issued access tokens. |
| `AUTH_REFRESH_TOKEN_TTL` | `15d` | Refresh row lifetime and cookie `Max-Age`. |
| `AUTH_EMAIL_ENCRYPTION_KEY` | — | Required. 32 bytes, base64. Rotating it orphans existing rows. |
| `AUTH_REFRESH_COOKIE_SECURE` | `true` | Set `false` only for local HTTP development. |

Both lifetimes must carry a unit of a second or longer (`s`, `m`, `h`, `d`,
`w`, `y`), be greater than zero and be at most five digits; the service refuses
to start otherwise.

A bare number is rejected on purpose: `jsonwebtoken` reads `"300"` as 300
**milliseconds**, so a token written as five minutes would die instantly while
the response still advertised 300 seconds. `ms` is rejected for the same
reason — a sub-second refresh lifetime makes `expires_at` equal `issued_at`,
which the table's check constraint refuses. The digit ceiling covers the other
end: a longer run of digits overflows into an expiry no `Date` can represent,
and failing at startup beats failing at the first signup.

### 8.1 Rotating the signing key

The list in `AUTH_JWT_PUBLIC_KEYS` exists so a rotation costs no sessions. Each
step leaves every token already in a client's hands valid:

1. **Add the incoming public key** to `AUTH_JWT_PUBLIC_KEYS` in `market-trading`
   and deploy. It now accepts both keys and is still signed for by neither.
2. **Swap `AUTH_JWT_PRIVATE_KEY`** in `identity-auth`, adding the *outgoing*
   public key to its own `AUTH_JWT_PUBLIC_KEYS` at the same time, and deploy.
   New tokens carry the new `kid`; tokens signed a minute ago still verify on
   both services.
3. **Wait out `AUTH_ACCESS_TOKEN_TTL`** — five minutes by default. After it, no
   token signed with the outgoing key exists.
4. **Drop the outgoing key** from both services and deploy.

Doing step 2 before step 1 rejects every token issued between the two deploys.
Skipping step 3 rejects tokens that had not yet expired. Neither is recoverable
by retrying: an access token cannot be re-signed, only re-issued through
`POST /auth/refresh`, which the client only attempts once the current one
expires.

## 9. Consequences

- The SPA needs a login page, an auth context and token-refresh handling in
  `frontend/src/lib/api.ts`, including `credentials: 'include'`. Tracked separately;
  the "Sign in" buttons in `LandingNav.tsx` and `Sidebar.tsx` are decorative today.
- `identity-auth` must enable CORS with `credentials: true` and an explicit origin —
  a wildcard origin cannot carry cookies.
- The e2e suites that insert users with raw SQL can call signup instead.
- Access tokens now expire, so any long-lived manual token used in testing stops
  working after five minutes.

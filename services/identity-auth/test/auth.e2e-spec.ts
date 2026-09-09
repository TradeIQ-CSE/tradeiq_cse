import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, createPublicKey } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureIdentityAuthApp } from '../src/app.setup';

// docs/api/auth-v1.md §7 — the worked examples are the assertions below.
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const EMAIL = 'ama@example.lk';
  const PASSWORD = 'correct horse battery staple';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureIdentityAuthApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE auth.users CASCADE');
  });

  const api = () => request(app.getHttpServer());

  function signup(overrides: Record<string, unknown> = {}) {
    return api()
      .post('/auth/signup')
      .send({
        email: EMAIL,
        password: PASSWORD,
        display_name: 'Ama Perera',
        ...overrides,
      });
  }

  // supertest exposes set-cookie as raw header strings; the token is the part
  // before the first attribute.
  function refreshCookie(response: request.Response): string {
    const header = response.headers['set-cookie'] as unknown as string[];
    const cookie = header.find((c) => c.startsWith('refresh_token='));
    if (!cookie) {
      throw new Error('No refresh_token cookie was set');
    }
    return cookie.split(';')[0];
  }

  describe('signup', () => {
    it('creates an account and returns a usable session', async () => {
      const response = await signup().expect(201);

      expect(response.body.data).toMatchObject({
        token_type: 'Bearer',
        expires_in: 300,
        user: { display_name: 'Ama Perera', role: 'investor' },
      });
      expect(response.body.data.access_token).toEqual(expect.any(String));

      // Spent on a guarded route to prove the token is usable, not merely
      // well-formed. /auth/me is this service's own: the trading routes it
      // used to call now live in market-trading.
      await api()
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.data.access_token}`)
        .expect(200);
    });

    // TIQ-133 — the issuer half of RS256. The header is what every verifier
    // reads before it does anything else: `alg` decides how the signature is
    // checked and `kid` decides which key it is checked against, so a token
    // issued without them is one market-trading refuses.
    //
    // `kid` is asserted against the key derived from AUTH_JWT_PRIVATE_KEY
    // rather than a literal, because a literal would still pass if the service
    // stamped a constant that had drifted from the key it signs with.
    it('signs the access token RS256 and names the signing key', async () => {
      const response = await signup().expect(201);
      const [encodedHeader] = (response.body.data.access_token as string).split(
        '.',
      );
      const header: unknown = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      );

      const expectedKeyId = createHash('sha256')
        .update(
          createPublicKey(
            Buffer.from(
              process.env.AUTH_JWT_PRIVATE_KEY as string,
              'base64',
            ).toString('utf8'),
          ).export({ type: 'spki', format: 'der' }),
        )
        .digest('base64url');

      expect(header).toMatchObject({ alg: 'RS256', kid: expectedKeyId });
    });

    it('never returns the refresh token in the body', async () => {
      // §4.6 — the whole point of the cookie is that page JavaScript cannot
      // reach the long-lived credential.
      const response = await signup().expect(201);
      expect(JSON.stringify(response.body)).not.toContain(
        refreshCookie(response).split('=')[1],
      );
    });

    it('sets an httpOnly, path-scoped refresh cookie', async () => {
      const response = await signup().expect(201);
      const header = response.headers['set-cookie'] as unknown as string[];
      const cookie = header.find((c) => c.startsWith('refresh_token='))!;

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/auth');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('stores no plaintext email or password', async () => {
      await signup().expect(201);
      const [row] = await dataSource.query(
        'SELECT email_encrypted, email_hash, password_hash FROM auth.users',
      );

      expect(row.email_encrypted).not.toContain(EMAIL);
      expect(row.email_hash).not.toContain(EMAIL);
      expect(row.password_hash).not.toContain(PASSWORD);
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
    });

    it('rejects a second signup for the same address', async () => {
      await signup().expect(201);
      const response = await signup().expect(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('treats the address case-insensitively', async () => {
      await signup().expect(201);
      await signup({ email: 'AMA@Example.LK' }).expect(409);
    });

    it('ignores a client-supplied role', async () => {
      // whitelist: true strips it, so nobody signs themselves up as an admin.
      const response = await signup({ role: 'admin' }).expect(201);
      expect(response.body.data.user.role).toBe('investor');
    });

    it.each([
      ['a malformed email', { email: 'not-an-email' }],
      ['a short password', { password: 'short' }],
      ['a blank display name', { display_name: '  ' }],
      ['an unsupported language', { language_pref: 'fr' }],
    ])('rejects %s', async (_label, overrides) => {
      const response = await signup(overrides).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await signup().expect(201);
    });

    it('accepts the right password', async () => {
      const response = await api()
        .post('/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);

      expect(response.body.data.access_token).toEqual(expect.any(String));
      expect(refreshCookie(response)).toMatch(/^refresh_token=.+/);
    });

    it('accepts a differently-cased address', async () => {
      await api()
        .post('/auth/login')
        .send({ email: '  AMA@Example.LK ', password: PASSWORD })
        .expect(200);
    });

    // §4.2 — the two failures must be indistinguishable, or login becomes an
    // oracle for which addresses are registered.
    it('answers identically for a wrong password and an unknown account', async () => {
      const wrongPassword = await api()
        .post('/auth/login')
        .send({ email: EMAIL, password: 'not the password' })
        .expect(401);

      const unknownAccount = await api()
        .post('/auth/login')
        .send({ email: 'nobody@example.lk', password: 'not the password' })
        .expect(401);

      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownAccount.body.error).toMatchObject({
        code: wrongPassword.body.error.code,
        message: wrongPassword.body.error.message,
      });
    });

    it('rejects a malformed address the same way as a wrong password', async () => {
      // A stricter validator on LoginDto would answer 400 here and 401 above,
      // which is the same disclosure by another route.
      const response = await api()
        .post('/auth/login')
        .send({ email: 'not-an-email', password: PASSWORD })
        .expect(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('refresh', () => {
    let cookie: string;

    beforeEach(async () => {
      cookie = refreshCookie(await signup().expect(201));
    });

    it('exchanges the cookie for a new session and rotates it', async () => {
      const response = await api()
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.data.access_token).toEqual(expect.any(String));
      expect(refreshCookie(response)).not.toBe(cookie);
    });

    it('keeps the new token in the same family', async () => {
      await api().post('/auth/refresh').set('Cookie', cookie).expect(200);
      const families = await dataSource.query(
        'SELECT DISTINCT family_id FROM auth.refresh_tokens',
      );
      expect(families).toHaveLength(1);
    });

    // §3, the substance of the whole feature.
    it('revokes the entire family when a spent token is replayed', async () => {
      const rotated = refreshCookie(
        await api().post('/auth/refresh').set('Cookie', cookie).expect(200),
      );

      const replay = await api()
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      expect(replay.body.error.code).toBe('REFRESH_TOKEN_INVALID');

      // The honest client's current token is collateral damage, deliberately:
      // the server cannot tell which holder is the thief.
      await api().post('/auth/refresh').set('Cookie', rotated).expect(401);
    });

    // NOTE: the test above covers that reuse revokes the family and that the
    // revocation survives the request's own rollback — drop the revoke from
    // AuthService.refresh, or throw from inside the transaction instead of
    // returning, and its last assertion fails.
    //
    // The test below covers the concurrency the family lock exists for. Two
    // earlier attempts raced two concurrent refreshes against each other and
    // hoped the interleaving would exercise the lock; both were deleted
    // because they passed against a deliberately broken lockFamily() — a
    // racing test proves nothing when it cannot force the ordering it claims
    // to cover, and that false assurance is worse than no test at all.
    //
    // This version does not race anything. It takes the family lock itself,
    // on a dedicated connection, before the request under test is ever
    // fired — so the ordering is fixed by the test, not by luck. Only after
    // the test marks the token used and commits does the blocked request get
    // to proceed, so it reaches lockFamily() and re-reads the row *after*
    // that update is visible. Remove the lock and the request races the
    // test's own transaction instead of waiting for it, reads the row before
    // the update lands, and the assertions below fail.
    // Raised from jest's 5000ms default: the blocked-waiter poll below can
    // alone spend up to 5s, on top of signup, connect, startTransaction and
    // the FOR UPDATE. Hitting jest's default budget would abandon the test
    // before the finally below can release the query runner, leaving its
    // FOR UPDATE lock held and deadlocking whatever test runs next.
    it('revokes the family when the presented token is spent while a concurrent transaction holds the family lock', async () => {
      const token = cookie.split('=')[1];
      // Only the hash is ever stored (docs/api/auth-v1.md §2.2), so the row
      // has to be found by hashing the raw token the same way the service
      // does, not by looking the token up directly.
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const [{ family_id: familyId }] = await dataSource.query(
        'SELECT family_id FROM auth.refresh_tokens WHERE token_hash = $1',
        [tokenHash],
      );

      // A separate connection checked out of the same pool behind
      // `dataSource` (createQueryRunner() does not open a new pool of its
      // own) — that is what lets this transaction hold the lock on one
      // connection while the request under test runs its own transaction on
      // another. It relies on the pool having room for both; nothing in
      // src/config/database.config.ts lowers pg's default max of 10.
      const runner = dataSource.createQueryRunner();

      try {
        await runner.connect();
        await runner.startTransaction();

        // The same row lock lockFamily() takes inside AuthService.refresh.
        // Holding it here means the request fired below cannot get past
        // lockFamily() until this transaction commits or rolls back.
        await runner.query(
          'SELECT token_id FROM auth.refresh_tokens WHERE family_id = $1 FOR UPDATE',
          [familyId],
        );

        // Not awaited: the point is that this has to block inside
        // lockFamily() until the transaction above releases it. Built with
        // .end() rather than the usual `await api()...` chain: superagent's
        // request objects are lazy thenables that only dispatch on .then()
        // or .end(), so an unawaited `await`-style chain sends nothing until
        // something awaits it — the wait below would then elapse with no
        // request in flight, the row would already show used_at by the time
        // the request actually goes out, and this would pass on the ordinary
        // reuse path with or without the lock. .end() forces the request onto
        // the wire now, so it is genuinely blocked in lockFamily() while the
        // transaction above still holds the row.
        const refreshPromise = new Promise<request.Response>(
          (resolve, reject) => {
            api()
              .post('/auth/refresh')
              .set('Cookie', cookie)
              .end((err, res) => (res ? resolve(res) : reject(err)));
          },
        );
        // If an assertion below fails before this is awaited, the request can
        // still settle on its own. Attaching a handler here keeps a
        // transport-level failure from surfacing as an unhandled rejection
        // against an unrelated test; `await refreshPromise` below still
        // throws normally.
        refreshPromise.catch(() => {});

        // The request must be genuinely parked in lockFamily() before the row
        // is spent below; otherwise it would take the ordinary reuse path and
        // pass even with the lock removed. A fixed sleep cannot tell the
        // difference — under load the request might not have reached
        // lockFamily() yet when the sleep ends, so the UPDATE+COMMIT would
        // land first and every assertion would still pass with no lock at
        // all. Poll Postgres for an actual blocked waiter instead, and fail
        // outright if one never appears.
        const deadline = Date.now() + 5000;
        let blocked = 0;
        while (Date.now() < deadline) {
          const [{ waiting }] = await dataSource.query(
            `SELECT count(*)::int AS waiting
               FROM pg_stat_activity
              WHERE datname = current_database()
                AND wait_event_type = 'Lock'
                AND state = 'active'
                AND pid <> pg_backend_pid()`,
          );
          blocked = waiting;
          if (blocked > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBeGreaterThan(0);

        // Stand in for the concurrent rotation that won the lock first: spend
        // the presented row, then let the blocked request through.
        await runner.query(
          'UPDATE auth.refresh_tokens SET used_at = now() WHERE token_hash = $1',
          [tokenHash],
        );
        await runner.commitTransaction();

        // superagent's end() callback treats any non-2xx as `err`, and 401 is
        // the expected outcome here, so the status is asserted directly
        // rather than relying on `.expect(401)`, which end() bypasses.
        const response = await refreshPromise;
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('REFRESH_TOKEN_INVALID');

        const rows: { revoked_at: string | null }[] = await dataSource.query(
          'SELECT revoked_at FROM auth.refresh_tokens WHERE family_id = $1',
          [familyId],
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.revoked_at).not.toBeNull();
        }
      } finally {
        // A wedged runner would break every later test, so this always
        // leaves it clean, whether or not the assertions above already
        // committed the transaction.
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
        await runner.release();
      }
    }, 20000);

    it('rejects a request with no cookie', async () => {
      const response = await api().post('/auth/refresh').expect(401);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    });

    it('rejects a token that was never issued', async () => {
      await api()
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=nothing-like-a-real-token')
        .expect(401);
    });

    it('rejects an expired token', async () => {
      // issued_at moves too: refresh_tokens_expiry_chk forbids an expiry that
      // precedes issue, so the row has to be backdated as a whole.
      await dataSource.query(
        `UPDATE auth.refresh_tokens
            SET issued_at  = now() - interval '16 days',
                expires_at = now() - interval '1 day'`,
      );
      const response = await api()
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    });
  });

  describe('logout', () => {
    it('revokes the session so the cookie stops working', async () => {
      const response = await signup().expect(201);
      const cookie = refreshCookie(response);
      const access = response.body.data.access_token;

      await api()
        .post('/auth/logout')
        .set('Authorization', `Bearer ${access}`)
        .set('Cookie', cookie)
        .expect(204);

      await api().post('/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('is idempotent', async () => {
      const response = await signup().expect(201);
      const cookie = refreshCookie(response);
      const auth = `Bearer ${response.body.data.access_token}`;

      await api()
        .post('/auth/logout')
        .set('Authorization', auth)
        .set('Cookie', cookie)
        .expect(204);
      await api()
        .post('/auth/logout')
        .set('Authorization', auth)
        .set('Cookie', cookie)
        .expect(204);
    });

    it('requires an access token', async () => {
      await api().post('/auth/logout').expect(401);
    });
  });

  describe('me', () => {
    it('returns the caller decrypted', async () => {
      const response = await signup().expect(201);

      const me = await api()
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.data.access_token}`)
        .expect(200);

      expect(me.body.data).toMatchObject({
        email: EMAIL,
        display_name: 'Ama Perera',
        role: 'investor',
        language_pref: 'en',
        email_verified: false,
      });
    });

    it('requires an access token', async () => {
      await api().get('/auth/me').expect(401);
    });

    it('rejects a token whose user has since been deleted', async () => {
      // The signature still verifies — only the database knows the account is
      // gone, so the handler has to check.
      const response = await signup().expect(201);
      await dataSource.query('DELETE FROM auth.users');

      await api()
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.data.access_token}`)
        .expect(401);
    });
  });
});

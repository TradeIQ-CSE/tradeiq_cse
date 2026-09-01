import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

      await api()
        .get('/portfolios')
        .set('Authorization', `Bearer ${response.body.data.access_token}`)
        .expect(200);
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

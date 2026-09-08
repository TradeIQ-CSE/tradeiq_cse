import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import { durationToSeconds } from '../auth/auth.service';
import { validate } from './env.validation';
import {
  DEVELOPMENT_JWT_SECRET,
  MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS,
  MIN_PRODUCTION_JWT_SECRET_LENGTH,
} from './jwt-secret.validator';

const VALID_URL = 'postgresql://u:p@h:5432/db';
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

// The three variables with no default. Spread into a case that is meant to
// pass, so a test only fails for the reason it is testing.
const REQUIRED = {
  AUTH_DATABASE_URL: VALID_URL,
  JWT_SECRET: 'test-secret',
  AUTH_EMAIL_ENCRYPTION_KEY: VALID_KEY,
};

describe('config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  describe('appConfig', () => {
    it('defaults the port when IDENTITY_AUTH_PORT is unset', () => {
      delete process.env.IDENTITY_AUTH_PORT;
      expect(appConfig().port).toBe(3002);
    });

    it('parses IDENTITY_AUTH_PORT as a number', () => {
      process.env.IDENTITY_AUTH_PORT = '4200';
      expect(appConfig().port).toBe(4200);
    });
  });

  describe('databaseConfig', () => {
    it('exposes the database url', () => {
      process.env.AUTH_DATABASE_URL = VALID_URL;
      expect(databaseConfig().url).toBe(VALID_URL);
    });
  });

  describe('authConfig', () => {
    it('exposes the jwt secret', () => {
      process.env.JWT_SECRET = 'test-secret';
      expect(authConfig().jwtSecret).toBe('test-secret');
    });

    it('defaults the token lifetimes to docs/api/auth-v1.md §2', () => {
      delete process.env.AUTH_ACCESS_TOKEN_TTL;
      delete process.env.AUTH_REFRESH_TOKEN_TTL;
      expect(authConfig().accessTokenTtl).toBe('5m');
      expect(authConfig().refreshTokenTtl).toBe('15d');
    });

    it('reads configured token lifetimes', () => {
      process.env.AUTH_ACCESS_TOKEN_TTL = '90s';
      process.env.AUTH_REFRESH_TOKEN_TTL = '2d';
      expect(authConfig().accessTokenTtl).toBe('90s');
      expect(authConfig().refreshTokenTtl).toBe('2d');
    });

    // A secure cookie is dropped over plain HTTP, so the opt-out has to work —
    // but only for the exact string 'false', never by accident.
    it.each([
      [undefined, true],
      ['true', true],
      ['', true],
      ['FALSE', true],
      ['false', false],
    ])('maps AUTH_REFRESH_COOKIE_SECURE=%s to %s', (value, expected) => {
      if (value === undefined) {
        delete process.env.AUTH_REFRESH_COOKIE_SECURE;
      } else {
        process.env.AUTH_REFRESH_COOKIE_SECURE = value;
      }
      expect(authConfig().refreshCookieSecure).toBe(expected);
    });
  });

  describe('validate', () => {
    it('accepts a minimal valid environment', () => {
      const validated = validate({
        ...REQUIRED,
      });
      expect(validated.AUTH_DATABASE_URL).toBe(VALID_URL);
      expect(validated.JWT_SECRET).toBe('test-secret');
    });

    it('coerces a numeric port string to a number', () => {
      const validated = validate({
        ...REQUIRED,
        IDENTITY_AUTH_PORT: '3002',
      });
      expect(validated.IDENTITY_AUTH_PORT).toBe(3002);
    });

    it.each(['AUTH_DATABASE_URL', 'JWT_SECRET', 'AUTH_EMAIL_ENCRYPTION_KEY'])(
      'throws when %s is missing',
      (key) => {
        const rest = { ...(REQUIRED as Record<string, string>) };
        delete rest[key];
        expect(() => validate(rest)).toThrow(
          'Invalid environment configuration',
        );
      },
    );

    // This service signs with JWT_SECRET, so a guessable value here forges
    // tokens both services accept. The check applies in production only: dev
    // and CI share one published value on purpose, since identity-auth and
    // market-trading must be given the same secret to interoperate.
    describe('JWT_SECRET strength', () => {
      // 32 random bytes, base64 — what the command in .env.example prints.
      // Sliced rather than padded so the length cases stay high-entropy and
      // fail for the one reason they are testing.
      const STRONG = 'Zq4vN8vLmR2xKfTb9wYhCd3JgEuPsA6nQzXr1TkVoBM=';
      const AT_MINIMUM = STRONG.slice(0, MIN_PRODUCTION_JWT_SECRET_LENGTH);
      const ONE_SHORT = STRONG.slice(0, MIN_PRODUCTION_JWT_SECRET_LENGTH - 1);

      // Long enough, but sitting on the variety floor from either side. Kept
      // as literals because a generated string with an exact distinct count is
      // harder to read than it is worth; the assertion below pins them to the
      // constant so raising the floor fails loudly here.
      const AT_FLOOR = 'a1b2c3d4e5f6a2b3c4d5e6f1a3b4c5d6';
      const BELOW_FLOOR = 'a1b2c3d4e5f5a2b3c4d5e5f1a3b4c5d5';

      it('has boundary fixtures that straddle the floor', () => {
        expect(AT_FLOOR.length).toBeGreaterThanOrEqual(
          MIN_PRODUCTION_JWT_SECRET_LENGTH,
        );
        expect(BELOW_FLOOR.length).toBeGreaterThanOrEqual(
          MIN_PRODUCTION_JWT_SECRET_LENGTH,
        );
        expect(new Set(AT_FLOOR).size).toBe(
          MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS,
        );
        expect(new Set(BELOW_FLOOR).size).toBe(
          MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS - 1,
        );
      });

      // DEVELOPMENT_JWT_SECRET is deliberately longer than the minimum and has
      // 20 distinct characters, so neither the length nor the variety rule
      // touches it. It has to be refused by name: .env.example prints it,
      // which makes it public knowledge.
      //
      // The two padded cases are the bypass the length rule invites — clearing
      // 32 characters by repeating one, or by tacking x's onto a short secret.
      it.each([
        ['the published development default', DEVELOPMENT_JWT_SECRET],
        ['the previous default', 'changeme'],
        ['a high-entropy secret one character under the minimum', ONE_SHORT],
        [
          'one character repeated to the minimum length',
          'k'.repeat(MIN_PRODUCTION_JWT_SECRET_LENGTH),
        ],
        [
          'a short secret padded out to the minimum length',
          `changeme${'x'.repeat(MIN_PRODUCTION_JWT_SECRET_LENGTH - 8)}`,
        ],
        ['a secret one distinct character under the floor', BELOW_FLOOR],
      ])('rejects %s in production', (_label, secret) => {
        expect(() =>
          validate({
            ...REQUIRED,
            NODE_ENV: 'production',
            JWT_SECRET: secret,
          }),
        ).toThrow('Invalid environment configuration');
      });

      // Both encodings an operator is likely to be handed. Hex is the tighter
      // of the two against the distinct-character floor (16 possible
      // characters, not 64), so it is here to pin that the floor leaves room.
      it.each([
        ['exactly the minimum length', AT_MINIMUM],
        ['base64', STRONG],
        [
          'hex',
          'f3a9c1e05b7d248fa6b0139e5c8247dbe1a705f92c6b3d84a0e15792cb6f30d4',
        ],
        // Exactly at the floor. Pins where the boundary sits, not that this is
        // a good secret — a 32-character string with only 12 distinct
        // characters has to repeat, and counting characters cannot see that.
        ['long enough with exactly the minimum variety', AT_FLOOR],
      ])('accepts a %s secret in production', (_label, secret) => {
        const validated = validate({
          ...REQUIRED,
          NODE_ENV: 'production',
          JWT_SECRET: secret,
        });
        expect(validated.JWT_SECRET).toBe(secret);
      });

      it.each(['development', 'test'])(
        'accepts the development default when NODE_ENV=%s',
        (nodeEnv) => {
          const validated = validate({
            ...REQUIRED,
            NODE_ENV: nodeEnv,
            JWT_SECRET: DEVELOPMENT_JWT_SECRET,
          });
          expect(validated.JWT_SECRET).toBe(DEVELOPMENT_JWT_SECRET);
        },
      );
    });

    it('rejects an encryption key that is not base64', () => {
      expect(() =>
        validate({ ...REQUIRED, AUTH_EMAIL_ENCRYPTION_KEY: 'not base64!!' }),
      ).toThrow('Invalid environment configuration');
    });

    // 99999y is the largest value the digit ceiling allows; it is here to pin
    // that the ceiling itself is still accepted, not just values below it.
    it.each(['5m', '15d', '300s', '1s', '2w', '99999y'])(
      'accepts the ttl %s',
      (ttl) => {
        const validated = validate({
          ...REQUIRED,
          AUTH_ACCESS_TOKEN_TTL: ttl,
        });
        expect(validated.AUTH_ACCESS_TOKEN_TTL).toBe(ttl);
      },
    );

    // jsonwebtoken passes a bare string to ms(), so each of these means
    // something other than what an operator writing it would expect, and the
    // token silently dies while expires_in still reports the intended number:
    //   "900" is 0.9s, "5min" is 0.005s, "0"/"0s" expire on issue.
    // Millisecond units are out entirely: anything under 500ms is a
    // zero-second lifetime once converted.
    // The long digit runs are the other end: '9'.repeat(400) converts to
    // Infinity and 10^9 days overflows the range a Date can represent, both of
    // which produce an Invalid Date expiry and a failed insert at signup.
    it.each([
      '900',
      '5min',
      'forever',
      '',
      '5 m',
      '0',
      '0s',
      '1ms',
      '499ms',
      '5000ms',
      '007',
      `${'9'.repeat(400)}s`,
      '1000000000d',
      '100000y',
    ])('rejects the ttl %s', (ttl) => {
      expect(() =>
        validate({ ...REQUIRED, AUTH_ACCESS_TOKEN_TTL: ttl }),
      ).toThrow('Invalid environment configuration');
    });

    // The refresh lifetime goes through the same validator. A value that
    // converts to zero seconds makes expires_at equal issued_at, which trips
    // refresh_tokens_expiry_chk and turns signup into a 500.
    it.each(['0', '900', '5min', '1ms', '499ms'])(
      'rejects the refresh ttl %s',
      (ttl) => {
        expect(() =>
          validate({ ...REQUIRED, AUTH_REFRESH_TOKEN_TTL: ttl }),
        ).toThrow('Invalid environment configuration');
      },
    );

    // Whatever the validator lets through must convert to a lifetime the
    // refresh_tokens check constraint accepts — at least one second — and must
    // still be a usable expiry date at the top of the range.
    it.each(['1s', '300s', '5m', '15d', '2w', '1y', '99999y'])(
      'converts the accepted ttl %s to a usable expiry',
      (ttl) => {
        validate({ ...REQUIRED, AUTH_REFRESH_TOKEN_TTL: ttl });
        const seconds = durationToSeconds(ttl);

        expect(seconds).toBeGreaterThanOrEqual(1);
        expect(Number.isSafeInteger(seconds)).toBe(true);
        expect(new Date(Date.now() + seconds * 1000).getTime()).not.toBeNaN();
      },
    );

    it('throws when the port is not an integer', () => {
      expect(() =>
        validate({
          ...REQUIRED,
          IDENTITY_AUTH_PORT: 'not-a-port',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('throws on an unknown NODE_ENV', () => {
      expect(() =>
        validate({
          ...REQUIRED,
          NODE_ENV: 'staging',
        }),
      ).toThrow('Invalid environment configuration');
    });
  });
});

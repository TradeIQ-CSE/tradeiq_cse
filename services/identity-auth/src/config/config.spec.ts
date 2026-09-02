import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import marketTradingConfig from './market-trading.config';
import { durationToSeconds } from '../auth/auth.service';
import { validate } from './env.validation';

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

  describe('marketTradingConfig', () => {
    it('defaults the base url and timeout when unset', () => {
      delete process.env.MARKET_TRADING_URL;
      delete process.env.MARKET_TRADING_TIMEOUT_MS;
      expect(marketTradingConfig()).toEqual({
        baseUrl: 'http://localhost:3001',
        timeoutMs: 3000,
      });
    });

    it('reads the configured base url and timeout', () => {
      process.env.MARKET_TRADING_URL = 'http://market-trading:3001';
      process.env.MARKET_TRADING_TIMEOUT_MS = '1500';
      expect(marketTradingConfig()).toEqual({
        baseUrl: 'http://market-trading:3001',
        timeoutMs: 1500,
      });
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

    it('accepts a hostname-only market-trading url', () => {
      // http://market-trading:3001 is what compose injects; it has no TLD, so
      // the validator must not insist on one.
      const validated = validate({
        ...REQUIRED,
        MARKET_TRADING_URL: 'http://market-trading:3001',
      });
      expect(validated.MARKET_TRADING_URL).toBe('http://market-trading:3001');
    });

    it('throws when the market-trading url is not a url', () => {
      expect(() =>
        validate({
          ...REQUIRED,
          MARKET_TRADING_URL: 'not a url',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('throws when the market-trading timeout is not an integer', () => {
      expect(() =>
        validate({
          ...REQUIRED,
          MARKET_TRADING_TIMEOUT_MS: 'soon',
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

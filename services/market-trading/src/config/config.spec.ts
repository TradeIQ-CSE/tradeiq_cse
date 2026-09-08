import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import { validate } from './env.validation';
import {
  DEVELOPMENT_JWT_SECRET,
  MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS,
  MIN_PRODUCTION_JWT_SECRET_LENGTH,
} from './jwt-secret.validator';

const VALID_URL = 'postgresql://u:p@h:5432/db';
const VALID_SECRET = 'test-secret';

// Every environment below must carry both required variables, so the minimum
// is named once rather than repeated per case.
const MINIMAL_ENV = {
  MARKET_DATA_DATABASE_URL: VALID_URL,
  JWT_SECRET: VALID_SECRET,
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
    it('defaults the port when MARKET_TRADING_PORT is unset', () => {
      delete process.env.MARKET_TRADING_PORT;
      expect(appConfig().port).toBe(3001);
    });

    it('parses MARKET_TRADING_PORT as a number', () => {
      process.env.MARKET_TRADING_PORT = '4100';
      expect(appConfig().port).toBe(4100);
    });

    it('defaults CORS origins to the Vite dev server', () => {
      delete process.env.MARKET_TRADING_CORS_ORIGINS;
      expect(appConfig().corsOrigins).toEqual(['http://localhost:5173']);
    });

    it('splits and trims a comma-separated CORS origin list', () => {
      process.env.MARKET_TRADING_CORS_ORIGINS =
        'http://localhost:5173, https://app.example.com';
      expect(appConfig().corsOrigins).toEqual([
        'http://localhost:5173',
        'https://app.example.com',
      ]);
    });

    it('drops empty entries from a trailing or doubled comma', () => {
      process.env.MARKET_TRADING_CORS_ORIGINS = 'http://a.test,,http://b.test,';
      expect(appConfig().corsOrigins).toEqual([
        'http://a.test',
        'http://b.test',
      ]);
    });
  });

  describe('authConfig', () => {
    it('exposes the shared access-token secret', () => {
      process.env.JWT_SECRET = VALID_SECRET;
      expect(authConfig().jwtSecret).toBe(VALID_SECRET);
    });

    it('falls back to an empty secret so a missing value fails validation, not startup', () => {
      delete process.env.JWT_SECRET;
      expect(authConfig().jwtSecret).toBe('');
    });
  });

  describe('databaseConfig', () => {
    it('exposes the database url', () => {
      process.env.MARKET_DATA_DATABASE_URL = VALID_URL;
      expect(databaseConfig().url).toBe(VALID_URL);
    });
  });

  describe('validate', () => {
    it('accepts a minimal valid environment', () => {
      const validated = validate({ ...MINIMAL_ENV });
      expect(validated.MARKET_DATA_DATABASE_URL).toBe(VALID_URL);
      expect(validated.JWT_SECRET).toBe(VALID_SECRET);
    });

    // The guard verifies with this secret, so booting without it would turn
    // every authenticated request into a 401 that looks like a client fault.
    it.each(['MARKET_DATA_DATABASE_URL', 'JWT_SECRET'])(
      'throws when %s is missing',
      (key) => {
        const env: Record<string, string> = { ...MINIMAL_ENV };
        delete env[key];
        expect(() => validate(env)).toThrow(
          'Invalid environment configuration',
        );
      },
    );

    it('throws when the secret is present but empty', () => {
      expect(() => validate({ ...MINIMAL_ENV, JWT_SECRET: '' })).toThrow(
        'Invalid environment configuration',
      );
    });

    // Under HS256 the verification key is also a signing key, so a secret an
    // attacker can guess or read out of this repository lets them mint a token
    // for any user id. Production is the only place that matters, and the only
    // place the check applies: dev and CI share one well-known value on
    // purpose, because both services have to be handed the same one.
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
            ...MINIMAL_ENV,
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
          ...MINIMAL_ENV,
          NODE_ENV: 'production',
          JWT_SECRET: secret,
        });
        expect(validated.JWT_SECRET).toBe(secret);
      });

      // `docker compose up` from a clean checkout must keep working.
      it.each(['development', 'test'])(
        'accepts the development default when NODE_ENV=%s',
        (nodeEnv) => {
          const validated = validate({
            ...MINIMAL_ENV,
            NODE_ENV: nodeEnv,
            JWT_SECRET: DEVELOPMENT_JWT_SECRET,
          });
          expect(validated.JWT_SECRET).toBe(DEVELOPMENT_JWT_SECRET);
        },
      );
    });

    it('allows an empty ingestion token so the write API can be disabled', () => {
      const validated = validate({
        ...MINIMAL_ENV,
        MARKET_INGESTION_TOKEN: '',
      });
      expect(validated.MARKET_INGESTION_TOKEN).toBe('');
    });

    it('coerces a numeric port string to a number', () => {
      const validated = validate({
        ...MINIMAL_ENV,
        MARKET_TRADING_PORT: '3001',
      });
      expect(validated.MARKET_TRADING_PORT).toBe(3001);
    });

    it('throws when the port is not an integer', () => {
      expect(() =>
        validate({
          ...MINIMAL_ENV,
          MARKET_TRADING_PORT: 'not-a-port',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('throws on an unknown NODE_ENV', () => {
      expect(() =>
        validate({
          ...MINIMAL_ENV,
          NODE_ENV: 'staging',
        }),
      ).toThrow('Invalid environment configuration');
    });
  });
});

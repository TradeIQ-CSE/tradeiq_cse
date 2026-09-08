import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import { validate } from './env.validation';

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

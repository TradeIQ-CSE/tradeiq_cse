import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import marketTradingConfig from './market-trading.config';
import { validate } from './env.validation';

const VALID_URL = 'postgresql://u:p@h:5432/db';

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
        AUTH_DATABASE_URL: VALID_URL,
        JWT_SECRET: 'test-secret',
      });
      expect(validated.AUTH_DATABASE_URL).toBe(VALID_URL);
      expect(validated.JWT_SECRET).toBe('test-secret');
    });

    it('coerces a numeric port string to a number', () => {
      const validated = validate({
        AUTH_DATABASE_URL: VALID_URL,
        JWT_SECRET: 'test-secret',
        IDENTITY_AUTH_PORT: '3002',
      });
      expect(validated.IDENTITY_AUTH_PORT).toBe(3002);
    });

    it('throws when the database url is missing', () => {
      expect(() => validate({ JWT_SECRET: 'test-secret' })).toThrow(
        'Invalid environment configuration',
      );
    });

    it('throws when the jwt secret is missing', () => {
      expect(() => validate({ AUTH_DATABASE_URL: VALID_URL })).toThrow(
        'Invalid environment configuration',
      );
    });

    it('throws when the port is not an integer', () => {
      expect(() =>
        validate({
          AUTH_DATABASE_URL: VALID_URL,
          JWT_SECRET: 'test-secret',
          IDENTITY_AUTH_PORT: 'not-a-port',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('accepts a hostname-only market-trading url', () => {
      // http://market-trading:3001 is what compose injects; it has no TLD, so
      // the validator must not insist on one.
      const validated = validate({
        AUTH_DATABASE_URL: VALID_URL,
        JWT_SECRET: 'test-secret',
        MARKET_TRADING_URL: 'http://market-trading:3001',
      });
      expect(validated.MARKET_TRADING_URL).toBe('http://market-trading:3001');
    });

    it('throws when the market-trading url is not a url', () => {
      expect(() =>
        validate({
          AUTH_DATABASE_URL: VALID_URL,
          JWT_SECRET: 'test-secret',
          MARKET_TRADING_URL: 'not a url',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('throws when the market-trading timeout is not an integer', () => {
      expect(() =>
        validate({
          AUTH_DATABASE_URL: VALID_URL,
          JWT_SECRET: 'test-secret',
          MARKET_TRADING_TIMEOUT_MS: 'soon',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('throws on an unknown NODE_ENV', () => {
      expect(() =>
        validate({
          AUTH_DATABASE_URL: VALID_URL,
          JWT_SECRET: 'test-secret',
          NODE_ENV: 'staging',
        }),
      ).toThrow('Invalid environment configuration');
    });
  });
});

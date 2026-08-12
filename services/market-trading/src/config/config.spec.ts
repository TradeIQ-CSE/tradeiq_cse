import appConfig from './app.config';
import databaseConfig from './database.config';
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

  describe('databaseConfig', () => {
    it('exposes the database url', () => {
      process.env.MARKET_DATA_DATABASE_URL = VALID_URL;
      expect(databaseConfig().url).toBe(VALID_URL);
    });
  });

  describe('validate', () => {
    it('accepts a minimal valid environment', () => {
      const validated = validate({ MARKET_DATA_DATABASE_URL: VALID_URL });
      expect(validated.MARKET_DATA_DATABASE_URL).toBe(VALID_URL);
    });

    it('coerces a numeric port string to a number', () => {
      const validated = validate({
        MARKET_DATA_DATABASE_URL: VALID_URL,
        MARKET_TRADING_PORT: '3001',
      });
      expect(validated.MARKET_TRADING_PORT).toBe(3001);
    });

    it('throws when the database url is missing', () => {
      expect(() => validate({})).toThrow('Invalid environment configuration');
    });

    it('throws when the port is not an integer', () => {
      expect(() =>
        validate({
          MARKET_DATA_DATABASE_URL: VALID_URL,
          MARKET_TRADING_PORT: 'not-a-port',
        }),
      ).toThrow('Invalid environment configuration');
    });

    it('throws on an unknown NODE_ENV', () => {
      expect(() =>
        validate({
          MARKET_DATA_DATABASE_URL: VALID_URL,
          NODE_ENV: 'staging',
        }),
      ).toThrow('Invalid environment configuration');
    });
  });
});

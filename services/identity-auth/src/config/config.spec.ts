import appConfig from './app.config';
import authConfig from './auth.config';
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

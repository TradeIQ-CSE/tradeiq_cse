import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import { generateKeyPairSync, KeyObject } from 'crypto';
import { validate } from './env.validation';
import {
  DEVELOPMENT_JWT_PUBLIC_KEY,
  MIN_ACCESS_TOKEN_KEY_BITS,
} from './jwt-keys';

const VALID_URL = 'postgresql://u:p@h:5432/db';

function encodePublicKey(key: KeyObject): string {
  return Buffer.from(
    key.export({ type: 'spki', format: 'pem' }) as string,
  ).toString('base64');
}

function rsaPublicKey(bits: number): string {
  return encodePublicKey(
    generateKeyPairSync('rsa', { modulusLength: bits }).publicKey,
  );
}

// Generated once for the file: an RSA keygen is slow enough that doing it per
// case would dominate the suite's runtime.
const VALID_KEY = rsaPublicKey(MIN_ACCESS_TOKEN_KEY_BITS);
const SECOND_KEY = rsaPublicKey(MIN_ACCESS_TOKEN_KEY_BITS);

// Every environment below must carry both required variables, so the minimum
// is named once rather than repeated per case.
const MINIMAL_ENV = {
  MARKET_DATA_DATABASE_URL: VALID_URL,
  AUTH_JWT_PUBLIC_KEYS: VALID_KEY,
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
    it('exposes the access-token public keys', () => {
      process.env.AUTH_JWT_PUBLIC_KEYS = VALID_KEY;
      expect(authConfig().publicKeys).toBe(VALID_KEY);
    });

    it('falls back to an empty ring so a missing value fails validation, not startup', () => {
      delete process.env.AUTH_JWT_PUBLIC_KEYS;
      expect(authConfig().publicKeys).toBe('');
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
      expect(validated.AUTH_JWT_PUBLIC_KEYS).toBe(VALID_KEY);
    });

    // The guard verifies against these keys, so booting without them would
    // turn every authenticated request into a 401 that looks like a client
    // fault.
    it.each(['MARKET_DATA_DATABASE_URL', 'AUTH_JWT_PUBLIC_KEYS'])(
      'throws when %s is missing',
      (key) => {
        const env: Record<string, string> = { ...MINIMAL_ENV };
        delete env[key];
        expect(() => validate(env)).toThrow(
          'Invalid environment configuration',
        );
      },
    );

    it('throws when the key ring is present but empty', () => {
      expect(() =>
        validate({ ...MINIMAL_ENV, AUTH_JWT_PUBLIC_KEYS: '' }),
      ).toThrow('Invalid environment configuration');
    });

    // A verifier holds no signing key, so the old strength rules — length and
    // character variety — no longer apply: an RSA public key is not something
    // an attacker guesses. What is left is that the key be well formed, long
    // enough that the signature itself is not the weak part, and not the
    // published development pair, whose private half anyone can read out of
    // this repository and sign with.
    describe('AUTH_JWT_PUBLIC_KEYS', () => {
      it('accepts several comma-separated keys, so a rotation can be staged', () => {
        const ring = `${VALID_KEY},${SECOND_KEY}`;
        expect(
          validate({ ...MINIMAL_ENV, AUTH_JWT_PUBLIC_KEYS: ring })
            .AUTH_JWT_PUBLIC_KEYS,
        ).toBe(ring);
      });

      it('tolerates whitespace around the separator', () => {
        expect(() =>
          validate({
            ...MINIMAL_ENV,
            AUTH_JWT_PUBLIC_KEYS: `${VALID_KEY} , ${SECOND_KEY}`,
          }),
        ).not.toThrow();
      });

      // The same key twice is either a paste error or a rotation whose new
      // value never went in. Both leave the ring looking staged when it is
      // not, so the boot fails rather than quietly holding one key.
      it('rejects the same key listed twice', () => {
        expect(() =>
          validate({
            ...MINIMAL_ENV,
            AUTH_JWT_PUBLIC_KEYS: `${VALID_KEY},${VALID_KEY}`,
          }),
        ).toThrow('Invalid environment configuration');
      });

      it.each([
        ['not base64-encoded at all', 'not-a-key'],
        [
          'base64 of something that is not a PEM',
          Buffer.from('nope').toString('base64'),
        ],
        ['a truncated PEM', VALID_KEY.slice(0, 40)],
        ['one good key and one bad', `${VALID_KEY},not-a-key`],
      ])('rejects a ring that is %s', (_label, ring) => {
        expect(() =>
          validate({ ...MINIMAL_ENV, AUTH_JWT_PUBLIC_KEYS: ring }),
        ).toThrow('Invalid environment configuration');
      });

      // Size and type are checked in every environment, not just production:
      // a key this service cannot verify against is a boot failure whatever
      // the environment, and without the check it would present as every
      // authenticated request returning 401.
      it('rejects an RSA key below the minimum size', () => {
        expect(() =>
          validate({
            ...MINIMAL_ENV,
            AUTH_JWT_PUBLIC_KEYS: rsaPublicKey(1024),
          }),
        ).toThrow('Invalid environment configuration');
      });

      it('rejects a key of the wrong type', () => {
        const ec = encodePublicKey(
          generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey,
        );
        expect(() =>
          validate({ ...MINIMAL_ENV, AUTH_JWT_PUBLIC_KEYS: ec }),
        ).toThrow('Invalid environment configuration');
      });

      // Its private half is printed in .env.example, so anyone can mint a
      // token this key verifies. It is refused by identity — nothing about its
      // size or shape distinguishes it from a real key.
      it('rejects the published development key in production', () => {
        expect(() =>
          validate({
            ...MINIMAL_ENV,
            NODE_ENV: 'production',
            AUTH_JWT_PUBLIC_KEYS: DEVELOPMENT_JWT_PUBLIC_KEY,
          }),
        ).toThrow('Invalid environment configuration');
      });

      it('rejects it even alongside a real key', () => {
        expect(() =>
          validate({
            ...MINIMAL_ENV,
            NODE_ENV: 'production',
            AUTH_JWT_PUBLIC_KEYS: `${VALID_KEY},${DEVELOPMENT_JWT_PUBLIC_KEY}`,
          }),
        ).toThrow('Invalid environment configuration');
      });

      it('accepts a generated key in production', () => {
        expect(() =>
          validate({ ...MINIMAL_ENV, NODE_ENV: 'production' }),
        ).not.toThrow();
      });

      // `docker compose up` from a clean checkout must keep working.
      it.each(['development', 'test'])(
        'accepts the development key when NODE_ENV=%s',
        (nodeEnv) => {
          const validated = validate({
            ...MINIMAL_ENV,
            NODE_ENV: nodeEnv,
            AUTH_JWT_PUBLIC_KEYS: DEVELOPMENT_JWT_PUBLIC_KEY,
          });
          expect(validated.AUTH_JWT_PUBLIC_KEYS).toBe(
            DEVELOPMENT_JWT_PUBLIC_KEY,
          );
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

import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import { durationToSeconds } from '../auth/auth.service';
import { generateKeyPairSync, KeyObject } from 'crypto';
import { validate } from './env.validation';
import {
  DEVELOPMENT_JWT_PRIVATE_KEY,
  MIN_ACCESS_TOKEN_KEY_BITS,
} from './jwt-keys';

const VALID_URL = 'postgresql://u:p@h:5432/db';
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

function encodePem(key: KeyObject, type: 'pkcs8' | 'spki'): string {
  return Buffer.from(key.export({ type, format: 'pem' }) as string).toString(
    'base64',
  );
}

function rsaPair(bits: number) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: bits,
  });
  return {
    privateKey: encodePem(privateKey, 'pkcs8'),
    publicKey: encodePem(publicKey, 'spki'),
  };
}

// Generated once for the file: an RSA keygen is slow enough that doing it per
// case would dominate the suite's runtime.
const SIGNING = rsaPair(MIN_ACCESS_TOKEN_KEY_BITS);
const RETIRING = rsaPair(MIN_ACCESS_TOKEN_KEY_BITS);

// The three variables with no default. Spread into a case that is meant to
// pass, so a test only fails for the reason it is testing.
const REQUIRED = {
  AUTH_DATABASE_URL: VALID_URL,
  AUTH_JWT_PRIVATE_KEY: SIGNING.privateKey,
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
    it('exposes the access-token signing key', () => {
      process.env.AUTH_JWT_PRIVATE_KEY = SIGNING.privateKey;
      expect(authConfig().privateKey).toBe(SIGNING.privateKey);
    });

    it('defaults the extra verification keys to an empty ring', () => {
      delete process.env.AUTH_JWT_PUBLIC_KEYS;
      expect(authConfig().publicKeys).toBe('');
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
      expect(validated.AUTH_JWT_PRIVATE_KEY).toBe(SIGNING.privateKey);
    });

    it('coerces a numeric port string to a number', () => {
      const validated = validate({
        ...REQUIRED,
        IDENTITY_AUTH_PORT: '3002',
      });
      expect(validated.IDENTITY_AUTH_PORT).toBe(3002);
    });

    it.each([
      'AUTH_DATABASE_URL',
      'AUTH_JWT_PRIVATE_KEY',
      'AUTH_EMAIL_ENCRYPTION_KEY',
    ])('throws when %s is missing', (key) => {
      const rest = { ...(REQUIRED as Record<string, string>) };
      delete rest[key];
      expect(() => validate(rest)).toThrow('Invalid environment configuration');
    });

    // This service holds the only key that can mint an access token, so the
    // checks here are about that key being real: well formed, long enough that
    // the signature rather than the secrecy is not the weak part, and not the
    // published development pair, whose private half is printed in
    // .env.example for anyone to sign with.
    describe('AUTH_JWT_PRIVATE_KEY', () => {
      it.each([
        ['not base64-encoded at all', 'not-a-key'],
        [
          'base64 of something that is not a PEM',
          Buffer.from('nope').toString('base64'),
        ],
        ['a truncated PEM', SIGNING.privateKey.slice(0, 40)],
        // A public key cannot sign. Worth its own case because it is the
        // plausible mistake — the two values sit next to each other in
        // .env.example and are both base64 PEMs.
        ['the public half of the pair', SIGNING.publicKey],
      ])('rejects a signing key that is %s', (_label, key) => {
        expect(() =>
          validate({ ...REQUIRED, AUTH_JWT_PRIVATE_KEY: key }),
        ).toThrow('Invalid environment configuration');
      });

      // Size and type are checked in every environment, not just production: a
      // key this service cannot sign with is a boot failure whatever the
      // environment, and without the check it would present as the first
      // signup returning 500.
      it('rejects an RSA key below the minimum size', () => {
        expect(() =>
          validate({
            ...REQUIRED,
            AUTH_JWT_PRIVATE_KEY: rsaPair(1024).privateKey,
          }),
        ).toThrow('Invalid environment configuration');
      });

      it('rejects a key of the wrong type', () => {
        const ec = encodePem(
          generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey,
          'pkcs8',
        );
        expect(() =>
          validate({ ...REQUIRED, AUTH_JWT_PRIVATE_KEY: ec }),
        ).toThrow('Invalid environment configuration');
      });

      // Published in this repository, so anyone can mint a token for any user
      // id with it. Refused by identity — nothing about its size or shape
      // distinguishes it from a real key.
      it('rejects the published development key in production', () => {
        expect(() =>
          validate({
            ...REQUIRED,
            NODE_ENV: 'production',
            AUTH_JWT_PRIVATE_KEY: DEVELOPMENT_JWT_PRIVATE_KEY,
          }),
        ).toThrow('Invalid environment configuration');
      });

      it('accepts a generated key in production', () => {
        expect(() =>
          validate({ ...REQUIRED, NODE_ENV: 'production' }),
        ).not.toThrow();
      });

      // `docker compose up` from a clean checkout must keep working.
      it.each(['development', 'test'])(
        'accepts the development key when NODE_ENV=%s',
        (nodeEnv) => {
          const validated = validate({
            ...REQUIRED,
            NODE_ENV: nodeEnv,
            AUTH_JWT_PRIVATE_KEY: DEVELOPMENT_JWT_PRIVATE_KEY,
          });
          expect(validated.AUTH_JWT_PRIVATE_KEY).toBe(
            DEVELOPMENT_JWT_PRIVATE_KEY,
          );
        },
      );
    });

    // Optional, and only meaningful mid-rotation: the signing key's own public
    // half is always accepted without being named here.
    describe('AUTH_JWT_PUBLIC_KEYS', () => {
      it('is optional', () => {
        expect(() => validate({ ...REQUIRED })).not.toThrow();
      });

      it('accepts a retiring key alongside the signing one', () => {
        expect(() =>
          validate({ ...REQUIRED, AUTH_JWT_PUBLIC_KEYS: RETIRING.publicKey }),
        ).not.toThrow();
      });

      it('rejects a malformed entry', () => {
        expect(() =>
          validate({ ...REQUIRED, AUTH_JWT_PUBLIC_KEYS: 'not-a-key' }),
        ).toThrow('Invalid environment configuration');
      });

      // Present but empty is a value someone meant to set and did not, which
      // is worth failing on rather than silently reading as "no extra keys".
      it('rejects an empty string', () => {
        expect(() =>
          validate({ ...REQUIRED, AUTH_JWT_PUBLIC_KEYS: '' }),
        ).toThrow('Invalid environment configuration');
      });
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

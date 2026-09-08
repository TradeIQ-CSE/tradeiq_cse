import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// The value `docker-compose.yml` and `.env.example` hand a developer who has
// not set JWT_SECRET. It exists so `docker compose up` works from a clean
// checkout; it is published in the repository, so it is public knowledge and
// must never reach a deployment. Keep it in step with those two files.
export const DEVELOPMENT_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';

// Also rejected by name because it was the previous default and is still
// sitting in the local .env of anyone who set one up before this check.
const KNOWN_WEAK_SECRETS = new Set([DEVELOPMENT_JWT_SECRET, 'changeme']);

// HS256 keys are compared against a hash of the whole token, so length is the
// only thing standing between an offline guess and a forged token. 32 bytes is
// the output size of SHA-256, the point past which a longer key adds nothing.
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

// A length floor on its own invites padding: an operator stopped by "at least
// 32 characters" can clear it with 'k' repeated 32 times, or by tacking x's
// onto a short secret. Counting distinct characters costs nothing and catches
// both, along with a repeated word.
//
// This is a guard against degenerate input, not a measure of entropy. Nothing
// available at boot can tell 32 random bytes from a memorable string of the
// same shape, so the threshold is deliberately loose: 32 random bytes carry
// about 32 distinct characters in base64 and about 16 in hex, so a real secret
// clears 12 with room to spare. A hex secret falls below it around once in
// 7000, and the message says to generate another.
export const MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS = 12;

/**
 * Rejects a JWT_SECRET that is short or publicly known, but only when
 * NODE_ENV=production.
 *
 * Development and CI deliberately share one well-known secret: both services
 * must be given the same value for a token issued by one to be accepted by the
 * other, and making every contributor generate and sync a key by hand buys
 * nothing on a laptop. Production is where a guessable value means anyone can
 * mint an access token for any user id, so that is where the check bites.
 *
 * Scoping it this way also keeps the failure loud: it fires at boot, in the
 * one environment that matters, rather than being disabled by an escape hatch
 * that would then be set everywhere.
 */
export function StrongInProduction(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'strongInProduction',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const env = (args.object as { NODE_ENV?: string }).NODE_ENV;
          if (env !== 'production') return true;
          if (typeof value !== 'string') return false;
          return (
            value.length >= MIN_PRODUCTION_JWT_SECRET_LENGTH &&
            new Set(value).size >=
              MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS &&
            !KNOWN_WEAK_SECRETS.has(value)
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters long, contain at least ${MIN_PRODUCTION_JWT_SECRET_DISTINCT_CHARACTERS} distinct characters, and must not be a published development default when NODE_ENV=production. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;
        },
      },
    });
  };
}

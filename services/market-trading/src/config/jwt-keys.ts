import { createHash, createPublicKey, KeyObject } from 'crypto';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// docs/api/auth-v1.md §2 and §8.
//
// Access tokens are signed RS256 by identity-auth. This service is a verifier:
// it is given public keys and nothing else, so its environment contains no
// value that can mint a token. Under the HS256 scheme this replaced, the same
// JWT_SECRET both signed and verified, and a read-only disclosure of this
// service's environment was enough to impersonate any user (TIQ-133).
//
// Mirrors identity-auth's copy of this module, minus the private half, which
// this service must never hold.
export const ACCESS_TOKEN_ALGORITHM = 'RS256' as const;

// Below this an RSA signature is cheap enough to forge offline that the key
// length, rather than the secrecy of the key, becomes the weakest part.
export const MIN_ACCESS_TOKEN_KEY_BITS = 2048;

// The public half of the keypair docker-compose.yml and .env.example hand a
// developer who has not generated one, so `docker compose up` works from a
// clean checkout. Its private half is published in this repository too, so
// anyone can mint a token that this key verifies: it must never reach a
// deployment. Keep it in step with those two files.
export const DEVELOPMENT_JWT_PUBLIC_KEY =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF1NHJEbFFvekVDT28yNEZMbWlHcgpyVGhSQkh5UFUxSlU0MjNEWjdSVlBQbnpFTWV0TElvZ1pGRkVBU1pKMzFDeW9yblNDUEJRY08zV0QzQ3FwT2xNClVUSFdUeHR5YTdxQmpIYzdQNUEzZ3kweHNBWXpDdHMvdWxONHBlVXY2cEN1R1JsNUp4cnpZNHZmZ2ZVQ1MrYk8KUitrRGkvZXVmdmM5V0ZWbGlOYk5tVlg0R05mK1E4dWZTNDhYYzY5OHJXQUVjRTR6RndJenoxazlqZG5jZ1U1bApRQzByQ1luRllTTnVtaFhlUTkzVjFoeWdFZDIreVBJTytCbHgrQXZuSm8yRW1vQThWRzQ4VUphOWEyR0JWVlNTCnNWUnJucGdPSzU2eVVoaVk3UnZlNHoyNXd3U2xzMjJTdGNIOGc3VW1YMjVDUTZ0b2NOYTZHOUI5bGk3bjVlMVAKendJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==';

// The key id of the pair above, computed by publicKeyId(). Both services
// reject it under NODE_ENV=production, and each recognises it from the half of
// the pair it holds.
export const DEVELOPMENT_JWT_KEY_ID =
  '0bIZSvQTjmqZAt-FWL3Zd9QGPgReiXdggVETF9pEN6w';

function decodePem(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

/**
 * The token header's `kid`: base64url of SHA-256 over the public key's SPKI
 * DER encoding.
 *
 * Derived rather than configured on purpose. A configured id is a second value
 * that has to be kept in step with the key it names, and nothing detects the
 * moment it stops matching. Deriving it means issuer and verifier reach the
 * same id from the same key without agreeing on anything else.
 */
export function publicKeyId(key: KeyObject): string {
  const der = key.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('base64url');
}

export function loadPublicKey(encoded: string): KeyObject {
  return createPublicKey(decodePem(encoded));
}

/** Throws unless the key is RSA and long enough to verify against. */
export function assertUsableKey(key: KeyObject): void {
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error(
      `expected an RSA key, got ${key.asymmetricKeyType ?? 'none'}`,
    );
  }

  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < MIN_ACCESS_TOKEN_KEY_BITS) {
    throw new Error(
      `expected at least ${MIN_ACCESS_TOKEN_KEY_BITS} bits, got ${bits}`,
    );
  }
}

export function splitKeyRing(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const GENERATE = [
  'Generate a pair with:',
  ` node -e "const {generateKeyPairSync}=require('crypto');`,
  `const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:${MIN_ACCESS_TOKEN_KEY_BITS}});`,
  `console.log('AUTH_JWT_PRIVATE_KEY='+Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'));`,
  `console.log('AUTH_JWT_PUBLIC_KEYS='+Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64'))"`,
].join('');

/**
 * Rejects an AUTH_JWT_PUBLIC_KEYS list that is malformed, and — only when
 * NODE_ENV=production — one containing the published development key.
 *
 * A list rather than a single key so a rotation can be staged: the incoming
 * key is added here and accepted before identity-auth starts signing with it,
 * and the outgoing one is dropped only once the last token it signed has
 * expired. With a single key, changing it rejects every token already in a
 * client's hands.
 *
 * The shape checks bite in every environment because a malformed key is a boot
 * failure either way: without them the service starts and then answers 401 to
 * every authenticated request instead of saying what is wrong.
 */
export function IsAccessTokenPublicKeyRing(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAccessTokenPublicKeyRing',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') return false;

          const entries = splitKeyRing(value);
          if (entries.length === 0) return false;

          const seen = new Set<string>();
          const env = (args.object as { NODE_ENV?: string }).NODE_ENV;

          for (const entry of entries) {
            let kid: string;
            try {
              const key = loadPublicKey(entry);
              assertUsableKey(key);
              kid = publicKeyId(key);
            } catch {
              return false;
            }

            // A duplicate is always a mistake — either the same key pasted
            // twice, or a rotation where the new value never replaced the old.
            if (seen.has(kid)) return false;
            seen.add(kid);

            if (env === 'production' && kid === DEVELOPMENT_JWT_KEY_ID) {
              return false;
            }
          }

          return true;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a comma-separated list of distinct base64-encoded SPKI PEMs, each holding an RSA public key of at least ${MIN_ACCESS_TOKEN_KEY_BITS} bits, and must not contain the published development key when NODE_ENV=production. ${GENERATE}`;
        },
      },
    });
  };
}

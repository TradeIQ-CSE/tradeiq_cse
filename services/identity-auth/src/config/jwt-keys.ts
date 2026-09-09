import {
  createHash,
  createPrivateKey,
  createPublicKey,
  KeyObject,
} from 'crypto';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// docs/api/auth-v1.md §2 and §8.
//
// Access tokens are signed RS256. This service holds the private key and is
// the only thing in the system that can mint a token; every verifier holds a
// public key and can do nothing but check one. Under the HS256 scheme this
// replaced, the verifying service held the signing key too, so a read-only
// disclosure of its environment was enough to impersonate any user (TIQ-133).
//
// The key material travels base64-encoded because a PEM is multi-line and
// every place that carries it — .env, docker-compose.yml, CI — wants one line.
export const ACCESS_TOKEN_ALGORITHM = 'RS256' as const;

// Below this an RSA signature is cheap enough to forge offline that the key
// length, rather than the secrecy of the key, becomes the weakest part.
export const MIN_ACCESS_TOKEN_KEY_BITS = 2048;

// The keypair docker-compose.yml and .env.example hand a developer who has not
// generated one, so `docker compose up` works from a clean checkout. It is
// published in this repository, so it is public knowledge: anyone can mint a
// token for any user id with it, and it must never reach a deployment. Keep it
// in step with those two files.
export const DEVELOPMENT_JWT_PRIVATE_KEY =
  'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2UUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRQzdpc09WQ2pNUUk2amIKZ1V1YUlhdXRPRkVFZkk5VFVsVGpiY05udEZVOCtmTVF4NjBzaWlCa1VVUUJKa25mVUxLaXVkSUk4RkJ3N2RZUApjS3FrNlV4Uk1kWlBHM0pydW9HTWR6cy9rRGVETFRHd0JqTUsyeis2VTNpbDVTL3FrSzRaR1hrbkd2TmppOStCCjlRSkw1czVINlFPTDk2NSs5ejFZVldXSTFzMlpWZmdZMS81RHk1OUxqeGR6cjN5dFlBUndUak1YQWpQUFdUMk4KMmR5QlRtVkFMU3NKaWNWaEkyNmFGZDVEM2RYV0hLQVIzYjdJOGc3NEdYSDRDK2NtallTYWdEeFVianhRbHIxcgpZWUZWVkpLeFZHdWVtQTRybnJKU0dKanRHOTdqUGJuREJLV3piWksxd2Z5RHRTWmZia0pEcTJodzFyb2IwSDJXCkx1Zmw3VS9QQWdNQkFBRUNnZ0VBQVUreWZmZnZDN29PMk43QlRHcVZtT2VLTStIbVZwam9pTWtqR3lzeWgzNkUKNDdwandJMEVXclVvYW5pT1hiUnAzN0JvUmtIdERPdnpiN0RiMnVIRVJHWW9iSjFnNXJ4cmNNSjNXZ2dnbmpZNwplTWZNbWlyUkQrMm1NMU9OeXVxeUpkc1lSU2ZiZU41Y0hyeFJubTlOalpJY0pCVG5CMEwwd2QzVkRTL24vNkhuCnIzOHV1Y0N4YmQrdHY1dXVjMjIySzdxUVdSYVRaVWVucG8yTjlGVWJ0M3p6MWZwc1ljWm1SaG5lczlBbkVudzUKT3c1UWF6b0RJN3lYVUtRMnJNTzRnTDdEZnFVbUdreE1sWWpYRld4L1QwVWNJVGZRbnBPVjd4dGZwT0tZUjBaQwpwZjRzMWJnRGJaaDRDdDl5d1doTFVPNWpsRUNvcXV4N0VKcXNZdUNoMFFLQmdRRDlOc1JXbU0veFYzWEU3YmMvClRPdzVBeWZoYW8wbU9KNWhnRzNzVms2OVB4L2EyUVJvZ1d2N0FWMUhrZTh3ckpsNUwyd0h1bnpVSkNDZkJjMnEKb0R5b1I1TXlFYWpqVTZnMEtDZHRPL25TKzl6ZnZwU2Y4aTdUaDFnUnVlUlNHZ2J1eGFubmJUdVZocDVmcTE3WQpHR0sybnVIWlNaNHBhbmRScG1uN1pkVVJud0tCZ1FDOW13U0UwZTFNM0psYWxWTHd3V3AvVXFoemIyNUhTR1RsCnVJVGh5em5iVG9QTWVTazIvM2wrU0ZSNXdoZ3hnK1d1ajhNVjNJMTJZSmVwTGpnQ29OU2VLaU9JM1AvWUZIZFMKTHl4cjBmUDBGdEpnUUp5b0tXaWdOZklqNHRwQ1F6UHFRS3pmeGVLUDFaQjNKd0pPMmx2WjM0d05yR3BLUzcvcwpPZklCTk1EejBRS0JnUUNpSmFMK3pTWkRwcno4bVRrQ0tSRVB4U3lSbGJqRFkvaFArWHpxbmE0WVU4YmpUcHNiCkROMkh3NnptK3RXUGRzZGtxZkJrMW8rL0RVOXlaYlg0OEZsSGJXWWQ1dDhlaTJDbjNacTV3WEZPSVFpa29wYnMKQVpyb3k3K2l3a1lxS1E2TmNqaEZ3VllwZnlZRm4yakJ1b1BqNjhRMmI0VC9nblRiN1ZQcXI2QU1nd0tCZ0VIQgpLT2dIQll6S1ZFU2QxSTI2QmZ6eDVZbGk4NU8wLzRqTFhRb1JPSmRkdTBlR0hVejlmRnpYS0xTeEkwTEl3emF1CmxMRllNNWNDR0phTGVORXdoWXYwZ1M1TnRreHhqSS9yM0RQb00vcEtqOXJoalhLa0theW1DTHQ1U01nQ0ZsYisKNXZVVDQyYU9ZZk53aTlSYzFjM1JRUGpjK2wrWnRZMXU2d2FRRFBxQkFvR0FDQm96SVY3b0RVbUVDcnUrY0NuQQpMVHZmV2VLWS9JUlpqam5VMVZBNHpVeWZEa1JUZmtOQjgwdll0WFI3d2ZSVUtKRVJRaFJJYnRCWThibXozYWp5ClI4NXhyTnVvcE1Rd1hiYmVpMmJ1MTAwQ0YyZUdTTW9LOTRCYm5ZQks2T1hBdVQ1RWtONlZvdngxVDRaRVFROUUKWFdhTFBnSkZybGxyOXhtalhVNXJyeFE9Ci0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0K';

// The key id of the pair above, computed by publicKeyId(). Both services
// reject it under NODE_ENV=production, and each recognises it from the half of
// the pair it holds — the id is derived from the public key, which identity-auth
// can compute from its private key and market-trading is given directly.
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

export function loadPrivateKey(encoded: string): KeyObject {
  return createPrivateKey(decodePem(encoded));
}

export function loadPublicKey(encoded: string): KeyObject {
  return createPublicKey(decodePem(encoded));
}

/** Throws unless the key is RSA and long enough to sign with. */
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

const GENERATE = [
  'Generate one with:',
  `  node -e "const {generateKeyPairSync}=require('crypto');`,
  `const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:${MIN_ACCESS_TOKEN_KEY_BITS}});`,
  `console.log('AUTH_JWT_PRIVATE_KEY='+Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'));`,
  `console.log('AUTH_JWT_PUBLIC_KEYS='+Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64'))"`,
].join('');

/**
 * Rejects an AUTH_JWT_PRIVATE_KEY that is not a usable RSA private key, and —
 * only when NODE_ENV=production — the published development key.
 *
 * The shape checks bite everywhere because a malformed key is a boot failure
 * either way: without them the service starts and then answers 500 to the
 * first signup instead of saying what is wrong. The development-key check is
 * scoped to production for the same reason the old secret check was: local
 * work and CI deliberately share one published keypair, because both services
 * have to agree on key material for a token issued by one to be accepted by
 * the other, and making every contributor generate and sync a pair by hand
 * buys nothing on a laptop.
 */
export function IsAccessTokenPrivateKey(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAccessTokenPrivateKey',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string' || value.length === 0) return false;

          let key: KeyObject;
          try {
            key = loadPrivateKey(value);
            assertUsableKey(key);
          } catch {
            return false;
          }

          const env = (args.object as { NODE_ENV?: string }).NODE_ENV;
          if (env !== 'production') return true;

          return publicKeyId(createPublicKey(key)) !== DEVELOPMENT_JWT_KEY_ID;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a base64-encoded PKCS#8 PEM holding an RSA private key of at least ${MIN_ACCESS_TOKEN_KEY_BITS} bits, and must not be the published development key when NODE_ENV=production. ${GENERATE}`;
        },
      },
    });
  };
}

/**
 * Rejects an AUTH_JWT_PUBLIC_KEYS list that is malformed, and — only when
 * NODE_ENV=production — one containing the published development key.
 *
 * A list rather than a single key so a rotation can be staged: the incoming
 * key is added here and accepted before anything starts signing with it, and
 * the outgoing one is dropped only once the last token it signed has expired.
 * With a single key, changing it rejects every token already in a client's
 * hands.
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

export function splitKeyRing(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

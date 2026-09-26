import { createHash, randomBytes } from 'crypto';

// docs/api/public-api-v1.md §2, ADR 0010 — `tiq_` followed by 40 base62
// characters (`A`-`Z`, `a`-`z`, `0`-`9`), roughly 238 bits of entropy. Pure
// functions, no I/O: the secret never touches a log or an error message
// anywhere in this module or its callers.

const PREFIX = 'tiq_';
const SECRET_LENGTH = 40;
const BASE62_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// 256 is not a multiple of 62 (256 = 4*62 + 8), so naively taking
// `byte % 62` would make the 8 leftover byte values land on the first 8
// alphabet characters twice as often as the rest. Rejecting any byte in that
// leftover range (>= 248) removes the bias entirely; the remaining 248
// values split into exactly four blocks of 62.
const REJECTION_CEILING = 248; // 256 - (256 % 62)

// docs/api/public-api-v1.md §2 — the full shape a well-formed key must have.
// Used both to validate user input (PR 4's guard) and, here, as the
// definition `generateApiKey` is built to satisfy.
const WELL_FORMED_PATTERN = /^tiq_[A-Za-z0-9]{40}$/;

export function generateApiKey(): string {
  const chars: string[] = [];

  while (chars.length < SECRET_LENGTH) {
    const bytes = randomBytes(SECRET_LENGTH - chars.length);
    for (const byte of bytes) {
      if (byte >= REJECTION_CEILING) continue;
      chars.push(BASE62_ALPHABET[byte % 62]);
      if (chars.length === SECRET_LENGTH) break;
    }
  }

  return PREFIX + chars.join('');
}

// The secret is never stored: only its hash is, matching the UNIQUE
// key_hash column and its `^[0-9a-f]{64}$` CHECK constraint
// (src/db/migrations/1788800000000-PublicApiKeys.ts).
export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

// docs/api/public-api-v1.md §7.1 — enough to recognise a key in a list
// without exposing the secret: `tiq_` plus the first 4 secret characters.
export function keyPrefix(secret: string): string {
  return secret.slice(0, 8);
}

export function isWellFormedApiKey(value: string): boolean {
  return WELL_FORMED_PATTERN.test(value);
}

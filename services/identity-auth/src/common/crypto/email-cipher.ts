import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

// docs/api/auth-v1.md §5 — auth.users holds no plaintext address. Two
// derivations of the same address, for two different jobs:
//
//   email_encrypted  reversible, because GET /auth/me returns the address
//   email_hash       deterministic, so login and the UNIQUE constraint can
//                    match an address without decrypting every row
//
// The hash is an HMAC rather than a plain digest: an attacker holding only the
// table cannot confirm a guessed address without also holding the key.
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

@Injectable()
export class EmailCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('auth.emailEncryptionKey'),
      'base64',
    );

    // Base64 validation at the env boundary does not constrain length, and
    // AES-256 silently needs exactly 32 bytes. Fail at boot, not at signup.
    if (this.key.length !== KEY_BYTES) {
      throw new Error(
        `AUTH_EMAIL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${this.key.length}`,
      );
    }
  }

  // Addresses are compared case-insensitively, so the hash has to be taken
  // over a normalised form or "Ama@..." and "ama@..." would become two
  // accounts that the UNIQUE constraint cannot tell apart.
  normalise(email: string): string {
    return email.trim().toLowerCase();
  }

  hash(email: string): string {
    return createHmac('sha256', this.key)
      .update(this.normalise(email))
      .digest('hex');
  }

  // Stored as iv:tag:ciphertext, all base64. The IV is fresh per call, so the
  // same address encrypts differently every time and the ciphertext column
  // leaks nothing about which rows share an address.
  encrypt(email: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(this.normalise(email), 'utf8'),
      cipher.final(),
    ]);

    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64'))
      .join(':');
  }

  decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) {
      throw new Error('Stored email is not in iv:tag:ciphertext form');
    }

    const [iv, tag, ciphertext] = parts.map((part) =>
      Buffer.from(part, 'base64'),
    );
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Stored email has a malformed iv or auth tag');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    // final() throws if the tag does not verify, so tampered ciphertext can
    // never be returned as if it were a real address.
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  matches(stored: string, email: string): boolean {
    const a = Buffer.from(this.hash(email), 'hex');
    const b = Buffer.from(stored, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

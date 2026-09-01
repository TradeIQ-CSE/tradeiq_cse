import { ConfigService } from '@nestjs/config';
import { EmailCipher } from './email-cipher';

function cipherWith(keyBase64: string): EmailCipher {
  const config = {
    getOrThrow: () => keyBase64,
  } as unknown as ConfigService;
  return new EmailCipher(config);
}

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const EMAIL = 'ama@example.lk';

describe('EmailCipher', () => {
  const cipher = cipherWith(KEY);

  describe('construction', () => {
    it.each([
      ['too short', Buffer.alloc(16, 1)],
      ['too long', Buffer.alloc(64, 1)],
    ])('rejects a key that is %s', (_label, key) => {
      expect(() => cipherWith(key.toString('base64'))).toThrow(
        'must decode to 32 bytes',
      );
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips an address', () => {
      expect(cipher.decrypt(cipher.encrypt(EMAIL))).toBe(EMAIL);
    });

    it('produces different ciphertext each time', () => {
      // A fresh IV per call, so the column never reveals which rows hold the
      // same address.
      expect(cipher.encrypt(EMAIL)).not.toBe(cipher.encrypt(EMAIL));
    });

    it('does not store the address in the clear', () => {
      const stored = cipher.encrypt(EMAIL);
      expect(stored).not.toContain(EMAIL);
      expect(Buffer.from(stored, 'base64').toString('utf8')).not.toContain(
        'example.lk',
      );
    });

    it('normalises case and surrounding space', () => {
      expect(cipher.decrypt(cipher.encrypt('  AMA@Example.LK '))).toBe(EMAIL);
    });

    it('refuses ciphertext encrypted under a different key', () => {
      const stored = cipherWith(OTHER_KEY).encrypt(EMAIL);
      expect(() => cipher.decrypt(stored)).toThrow();
    });

    it('refuses tampered ciphertext rather than returning garbage', () => {
      // GCM authenticates: flipping a byte must fail the tag check, not decode
      // to some other address.
      const [iv, tag, ciphertext] = cipher.encrypt(EMAIL).split(':');
      const bytes = Buffer.from(ciphertext, 'base64');
      bytes[0] ^= 0xff;
      expect(() =>
        cipher.decrypt(`${iv}:${tag}:${bytes.toString('base64')}`),
      ).toThrow();
    });

    it.each([
      ['no separators', 'notevenclose'],
      ['too few parts', 'aaaa:bbbb'],
      ['short iv', `${Buffer.alloc(4).toString('base64')}:${Buffer.alloc(16).toString('base64')}:AAAA`],
    ])('rejects a stored value with %s', (_label, stored) => {
      expect(() => cipher.decrypt(stored)).toThrow();
    });
  });

  describe('hash', () => {
    it('is stable across calls, so lookup by address works', () => {
      expect(cipher.hash(EMAIL)).toBe(cipher.hash(EMAIL));
    });

    it('ignores case and surrounding space', () => {
      expect(cipher.hash('  AMA@Example.LK ')).toBe(cipher.hash(EMAIL));
    });

    it('differs for different addresses', () => {
      expect(cipher.hash('other@example.lk')).not.toBe(cipher.hash(EMAIL));
    });

    it('is keyed, so the same address hashes differently under another key', () => {
      // Plain SHA-256 would let anyone holding the table confirm a guessed
      // address offline; the HMAC key is what prevents that.
      expect(cipherWith(OTHER_KEY).hash(EMAIL)).not.toBe(cipher.hash(EMAIL));
    });

    it('fits the varchar(64) email_hash column', () => {
      expect(cipher.hash(EMAIL)).toHaveLength(64);
    });
  });

  describe('matches', () => {
    it('accepts the address the hash came from', () => {
      expect(cipher.matches(cipher.hash(EMAIL), '  AMA@Example.LK ')).toBe(true);
    });

    it('rejects a different address', () => {
      expect(cipher.matches(cipher.hash(EMAIL), 'other@example.lk')).toBe(false);
    });

    it('rejects a stored hash of the wrong length without throwing', () => {
      expect(cipher.matches('abcd', EMAIL)).toBe(false);
    });
  });
});

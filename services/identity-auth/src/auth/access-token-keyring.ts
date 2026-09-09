import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, KeyObject } from 'crypto';
import {
  loadPrivateKey,
  loadPublicKey,
  publicKeyId,
  splitKeyRing,
} from '../config/jwt-keys';

/**
 * The public keys this service will accept an access token against, indexed by
 * the `kid` in the token header (docs/api/auth-v1.md §2).
 *
 * The key it signs with is always in the ring, derived from the private key
 * rather than configured a second time, so the common case needs no public-key
 * configuration here at all and cannot be set to a key that does not match.
 * `AUTH_JWT_PUBLIC_KEYS` adds to it, and exists for the middle of a rotation:
 * once this service signs with the new key, `GET /auth/me` still has to accept
 * the tokens it signed with the old one until they expire.
 *
 * Built once at boot rather than per request: parsing a PEM and hashing its
 * DER on every authenticated call would be pure waste, and the environment
 * cannot change underneath a running process.
 */
function pem(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }) as string;
}

@Injectable()
export class AccessTokenKeyring {
  // PEM text rather than a KeyObject: that is the shape jsonwebtoken's
  // verify options take, and converting once at boot beats converting on
  // every request.
  private readonly keys: ReadonlyMap<string, string>;

  constructor(config: ConfigService) {
    const signing = createPublicKey(
      loadPrivateKey(config.getOrThrow<string>('auth.privateKey')),
    );

    const ring = new Map<string, string>([
      [publicKeyId(signing), pem(signing)],
    ]);

    for (const encoded of splitKeyRing(
      config.get<string>('auth.publicKeys') ?? '',
    )) {
      const key = loadPublicKey(encoded);
      ring.set(publicKeyId(key), pem(key));
    }

    this.keys = ring;
  }

  /**
   * The key a token names, or undefined when it names one this service does
   * not hold.
   *
   * A token with no `kid` returns undefined rather than falling back to the
   * signing key. The fallback would work right up until a rotation added a
   * second key, at which point tokens that had been verifying for months would
   * start failing for a reason nothing in the request explains.
   */
  find(kid: unknown): string | undefined {
    return typeof kid === 'string' ? this.keys.get(kid) : undefined;
  }

  get size(): number {
    return this.keys.size;
  }
}

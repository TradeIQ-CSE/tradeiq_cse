import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadPublicKey, publicKeyId, splitKeyRing } from '../config/jwt-keys';

/**
 * The public keys this service will accept an access token against, indexed by
 * the `kid` in the token header (docs/api/auth-v1.md §2).
 *
 * Built once at boot rather than per request: parsing a PEM and hashing its
 * DER on every authenticated call would be pure waste, and the environment
 * cannot change underneath a running process.
 *
 * Holding several keys at once is what makes a rotation survivable. The
 * incoming key is added here and accepted before identity-auth starts signing
 * with it; the outgoing key is dropped only after the last token it signed has
 * expired. Neither step rejects a token a client is already holding.
 */
@Injectable()
export class AccessTokenKeyring {
  // PEM text rather than a KeyObject: that is the shape jsonwebtoken's
  // verify options take, and converting once at boot beats converting on
  // every request.
  private readonly keys: ReadonlyMap<string, string>;

  constructor(config: ConfigService) {
    const configured = splitKeyRing(
      config.getOrThrow<string>('auth.publicKeys'),
    );

    this.keys = new Map(
      configured.map((encoded) => {
        const key = loadPublicKey(encoded);
        return [
          publicKeyId(key),
          key.export({ type: 'spki', format: 'pem' }) as string,
        ];
      }),
    );
  }

  /**
   * The key a token names, or undefined when it names one this service does
   * not hold.
   *
   * A token with no `kid` returns undefined rather than falling back to the
   * only key when there happens to be one. The fallback would work right up
   * until a rotation added a second key, at which point tokens that had been
   * verifying for months would start failing for a reason nothing in the
   * request explains.
   */
  find(kid: unknown): string | undefined {
    return typeof kid === 'string' ? this.keys.get(kid) : undefined;
  }

  get size(): number {
    return this.keys.size;
  }
}

import { generateKeyPairSync, createHash, KeyObject } from 'crypto';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

// Access tokens are RS256 and this service holds no private key — that is the
// whole point of TIQ-133 — so an e2e test cannot mint one from the running
// application the way it used to under HS256.
//
// Each suite generates its own throwaway pair instead and points
// AUTH_JWT_PUBLIC_KEYS at the public half before the app boots. Nothing that
// can sign a token is committed to this service, and the test goes through the
// real configuration path rather than reaching past it.

export interface TestSigner {
  /** The value to put in AUTH_JWT_PUBLIC_KEYS before the app is created. */
  publicKeys: string;
  /** The `kid` tokens from this signer carry. */
  keyId: string;
  sign(payload: object, options?: JwtSignOptions): string;
  /**
   * The same key, the same claims, no `kid` in the header.
   *
   * Signed with this signer's own key on purpose: a token that is both
   * unknown-keyed and unknown-signed would be refused for either reason, and
   * would still be refused by an implementation that quietly fell back to
   * "the one key there is" when `kid` was missing.
   */
  signWithoutKeyId(payload: object): string;
}

function keyIdOf(key: KeyObject): string {
  return createHash('sha256')
    .update(key.export({ type: 'spki', format: 'der' }))
    .digest('base64url');
}

export function createTestSigner(): TestSigner {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const keyId = keyIdOf(publicKey);
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  const jwt = new JwtService({
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    signOptions: {
      algorithm: 'RS256',
      keyid: keyId,
      expiresIn: '5m',
    },
  });

  const privatePem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;

  const unkeyed = new JwtService({
    privateKey: privatePem,
    signOptions: { algorithm: 'RS256', expiresIn: '5m' },
  });

  return {
    publicKeys: Buffer.from(publicPem).toString('base64'),
    keyId,
    sign: (payload: object, options?: JwtSignOptions) =>
      jwt.sign(payload, options),
    signWithoutKeyId: (payload: object) => unkeyed.sign(payload),
  };
}

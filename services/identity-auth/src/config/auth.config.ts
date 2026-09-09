import { registerAs } from '@nestjs/config';

// docs/api/auth-v1.md §8. Defaults match §2: a short-lived access token,
// because it cannot be revoked, and a long-lived refresh token, because it can.
export default registerAs('auth', () => ({
  // The RS256 private key this service signs access tokens with, base64-encoded
  // PKCS#8 PEM. It exists in no other service: a verifier is given the public
  // half and can do nothing but check a signature.
  privateKey: process.env.AUTH_JWT_PRIVATE_KEY,
  // Optional additional verification keys, for the middle of a rotation. The
  // signing key's own public half is always accepted without being named here.
  publicKeys: process.env.AUTH_JWT_PUBLIC_KEYS ?? '',
  accessTokenTtl: process.env.AUTH_ACCESS_TOKEN_TTL ?? '5m',
  refreshTokenTtl: process.env.AUTH_REFRESH_TOKEN_TTL ?? '15d',
  emailEncryptionKey: process.env.AUTH_EMAIL_ENCRYPTION_KEY,
  // Opt out only for local HTTP development; a Secure cookie is dropped by the
  // browser over plain HTTP, which would silently break refresh.
  refreshCookieSecure: process.env.AUTH_REFRESH_COOKIE_SECURE !== 'false',
  issuer: 'tradeiq-identity-auth',
  audience: 'tradeiq-spa',
}));

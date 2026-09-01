import { registerAs } from '@nestjs/config';

// docs/api/auth-v1.md §8. Defaults match §2: a short-lived access token,
// because it cannot be revoked, and a long-lived refresh token, because it can.
export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  accessTokenTtl: process.env.AUTH_ACCESS_TOKEN_TTL ?? '5m',
  refreshTokenTtl: process.env.AUTH_REFRESH_TOKEN_TTL ?? '15d',
  emailEncryptionKey: process.env.AUTH_EMAIL_ENCRYPTION_KEY,
  // Opt out only for local HTTP development; a Secure cookie is dropped by the
  // browser over plain HTTP, which would silently break refresh.
  refreshCookieSecure: process.env.AUTH_REFRESH_COOKIE_SECURE !== 'false',
  issuer: 'tradeiq-identity-auth',
  audience: 'tradeiq-spa',
}));

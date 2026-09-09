import { registerAs } from '@nestjs/config';

// The public keys access tokens are verified against — a comma-separated list
// of base64-encoded SPKI PEMs. identity-auth issues the tokens this service
// only verifies (docs/api/auth-v1.md §2.1) and holds the private half alone,
// so nothing here can sign one.
export default registerAs('auth', () => ({
  publicKeys: process.env.AUTH_JWT_PUBLIC_KEYS ?? '',
}));

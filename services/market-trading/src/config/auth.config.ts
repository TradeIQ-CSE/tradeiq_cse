import { registerAs } from '@nestjs/config';

// The access-token signing secret. identity-auth issues the tokens this service
// only verifies (docs/api/auth-v1.md §2.1) and reads the same JWT_SECRET, so
// one value configures both sides and there is no second name to drift.
export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET ?? '',
}));

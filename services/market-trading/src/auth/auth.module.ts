import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ACCESS_TOKEN_ALGORITHM } from '../config/jwt-keys';
import { AccessTokenKeyring } from './access-token-keyring';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

// Verification only, and verification only is all this service can do: it is
// given the public half of identity-auth's signing key (AUTH_JWT_PUBLIC_KEYS)
// and no private key at all, so nothing in its environment can mint a token.
//
// The key itself is supplied per call by JwtAuthGuard, which picks it out of
// AccessTokenKeyring by the token's `kid`; JwtModule carries only the
// algorithm pin. RS256 is pinned rather than defaulted because the default
// accepts whatever the token's header asks for, and a token is not allowed to
// choose how it is checked — an attacker who re-signs the payload with the
// public key as an HMAC secret and sets `alg: HS256`, or drops the signature
// and sets `alg: none`, is answered with a 401 either way.
@Module({
  imports: [
    JwtModule.register({
      verifyOptions: {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
      },
    }),
  ],
  providers: [AccessTokenKeyring, JwtAuthGuard, AdminGuard],
  exports: [AccessTokenKeyring, JwtAuthGuard, AdminGuard, JwtModule],
})
export class AuthModule {}

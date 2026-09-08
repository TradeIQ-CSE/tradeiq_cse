import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

// Verification only. The secret is the one identity-auth signs with: both
// services must be given the same JWT_SECRET, and a mismatch shows up as every
// authenticated request failing rather than as a silent downgrade.
//
// HS256 means this service holds a key that can also sign tokens, which is more
// authority than a verifier needs. Moving issuance to RS256 and giving
// market-trading only the public key is TIQ-133; it changes the issuer, so it
// does not belong in the change that closes the ownership hole.
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.jwtSecret'),
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}

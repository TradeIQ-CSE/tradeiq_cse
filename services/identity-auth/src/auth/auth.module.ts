import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createPublicKey } from 'crypto';
import { EmailCipher } from '../common/crypto/email-cipher';
import {
  ACCESS_TOKEN_ALGORITHM,
  loadPrivateKey,
  publicKeyId,
} from '../config/jwt-keys';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { AccessTokenKeyring } from './access-token-keyring';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const signingKey = loadPrivateKey(
          config.getOrThrow<string>('auth.privateKey'),
        );

        // docs/api/auth-v1.md §2.1. expiresIn is what makes a leaked access
        // token expire on its own; issuer and audience stop a token minted for
        // some other service from being replayed here.
        //
        // `keyid` stamps the header `kid` every verifier indexes its keys by,
        // derived from the key rather than configured alongside it so the two
        // cannot drift apart. Verification supplies the key per call from
        // AccessTokenKeyring, so only the algorithm is pinned here — and it is
        // pinned rather than defaulted, because the default lets the token's
        // own header choose how it is checked.
        return {
          privateKey: signingKey.export({
            type: 'pkcs8',
            format: 'pem',
          }) as string,
          signOptions: {
            algorithm: ACCESS_TOKEN_ALGORITHM,
            keyid: publicKeyId(createPublicKey(signingKey)),
            expiresIn: config.getOrThrow<string>('auth.accessTokenTtl'),
            issuer: config.getOrThrow<string>('auth.issuer'),
            audience: config.getOrThrow<string>('auth.audience'),
          },
          verifyOptions: {
            algorithms: [ACCESS_TOKEN_ALGORITHM],
            issuer: config.getOrThrow<string>('auth.issuer'),
            audience: config.getOrThrow<string>('auth.audience'),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  // JwtAuthGuard is exported rather than registered as an APP_GUARD so
  // controllers opt in with @UseGuards. Global so it resolves in every feature
  // module without each one importing AuthModule.
  providers: [
    AccessTokenKeyring,
    AuthService,
    EmailCipher,
    JwtAuthGuard,
    AdminGuard,
  ],
  exports: [AccessTokenKeyring, JwtModule, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}

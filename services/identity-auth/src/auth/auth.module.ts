import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailCipher } from '../common/crypto/email-cipher';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
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
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.jwtSecret'),
        // docs/api/auth-v1.md §2.1. expiresIn is what makes a leaked access
        // token expire on its own; issuer and audience stop a token minted for
        // some other service from being replayed here.
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.getOrThrow<string>('auth.accessTokenTtl'),
          issuer: config.getOrThrow<string>('auth.issuer'),
          audience: config.getOrThrow<string>('auth.audience'),
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: config.getOrThrow<string>('auth.issuer'),
          audience: config.getOrThrow<string>('auth.audience'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  // JwtAuthGuard is exported rather than registered as an APP_GUARD so
  // controllers opt in with @UseGuards. Global so it resolves in every feature
  // module without each one importing AuthModule.
  providers: [AuthService, EmailCipher, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}

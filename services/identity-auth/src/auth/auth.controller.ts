import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { AuthenticatedUser } from './authenticated-user';
import { AuthService, IssuedSession } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const REFRESH_COOKIE = 'refresh_token';

// docs/api/auth-v1.md §4. Signup, login and refresh carry no guard — they are
// how a caller gets a token in the first place. Logout and me are guarded
// individually rather than at the class, so the split stays visible here.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithSession(await this.auth.signup(dto), res);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithSession(await this.auth.login(dto), res);
  }

  // Takes no body: the credential is the cookie, which the browser attaches
  // and page JavaScript cannot read.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.refresh(readRefreshCookie(req));
    return this.respondWithSession(session, res);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() principal: AuthenticatedUser) {
    const user = await this.auth.findActiveUser(principal.userId);

    // A token signed for a user who has since been deleted verifies fine — the
    // signature says nothing about whether the row still exists.
    if (!user) {
      throw new UnauthenticatedException();
    }

    return {
      data: {
        user_id: user.userId,
        email: this.auth.decryptEmail(user),
        display_name: user.displayName,
        role: user.role,
        language_pref: user.languagePref,
        email_verified: user.emailVerified,
      },
    };
  }

  private respondWithSession(session: IssuedSession, res: Response) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.auth.refreshTtlMs(),
    });
    return { data: session.body };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('auth.refreshCookieSecure'),
      sameSite: 'lax' as const,
      // Scoped so the refresh token is never attached to ordinary API traffic;
      // it only travels on the endpoints that actually consume it.
      path: '/auth',
    };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

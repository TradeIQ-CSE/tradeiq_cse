import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { AuthenticatedUser } from './authenticated-user';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

interface AccessTokenPayload {
  sub?: unknown;
  exp?: unknown;
}

// Applied per controller with @UseGuards, never globally: a controller that
// needs no authentication simply does not list this guard, so a route's auth
// policy is readable from the controller itself.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthenticatedException();
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);

      // A token with no exp is rejected rather than honoured forever
      // (docs/api/auth-v1.md §2.1). verifyAsync only enforces exp when the
      // claim is present, so a token signed without one would otherwise
      // authenticate indefinitely.
      if (typeof payload.exp !== 'number') {
        throw new UnauthenticatedException();
      }

      if (typeof payload.sub !== 'string' || !isUUID(payload.sub)) {
        throw new UnauthenticatedException();
      }

      request.user = { userId: payload.sub };
      return true;
    } catch {
      throw new UnauthenticatedException();
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return undefined;
    }

    const parts = authorization.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return undefined;
    }

    return parts[1] || undefined;
  }
}

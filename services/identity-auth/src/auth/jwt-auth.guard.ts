import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { AuthenticatedUser } from './authenticated-user';
import { PUBLIC_ROUTE_KEY } from './public.decorator';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

interface AccessTokenPayload {
  sub?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthenticatedException();
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
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

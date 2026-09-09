import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { AuthenticatedUser, UserRole } from './authenticated-user';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

interface AccessTokenPayload {
  sub?: unknown;
  exp?: unknown;
  role?: unknown;
}

// docs/api/auth-v1.md §2.1 — the role claim is authorization input, so it fails
// closed: only the exact string 'admin' grants admin, and a missing, misspelt,
// differently cased or non-string claim is an investor.
//
// Written as "is it admin" rather than "is it not investor" on purpose. The
// inverted form reads the same until a token arrives carrying role 'superuser'
// or role 123, at which point it grants admin to a value nobody defined.
function toRole(claim: unknown): UserRole {
  return claim === 'admin' ? 'admin' : 'investor';
}

// market-trading verifies access tokens; it never issues them. identity-auth
// remains the only issuer (docs/api/auth-v1.md §2.1), so there is no login,
// refresh or rotation here — only the check that a bearer token this service
// was handed was signed by that issuer and has not expired.
//
// Mirrors identity-auth's guard deliberately, claim for claim: two services
// that disagree about what makes a token valid would let a token be accepted
// by one and refused by the other for the same user.
//
// Applied per controller with @UseGuards, never globally: the public
// market-data reads (SRS 3.1.2.2) are unauthenticated by design, so a route's
// auth policy stays readable from the controller itself.
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

      request.user = { userId: payload.sub, role: toRole(payload.role) };
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

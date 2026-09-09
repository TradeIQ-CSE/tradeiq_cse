import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { ACCESS_TOKEN_ALGORITHM } from '../config/jwt-keys';
import { AccessTokenKeyring } from './access-token-keyring';
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
  constructor(
    private readonly jwtService: JwtService,
    private readonly keyring: AccessTokenKeyring,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthenticatedException();
    }

    try {
      // Which key to check against comes from the token's own `kid` header,
      // so the header is read before anything is trusted. That is safe only
      // because the answer is looked up rather than taken: an unrecognised
      // `kid` selects no key and the request is refused, so a token cannot
      // name key material this service was not configured with.
      const publicKey = this.keyring.find(this.keyIdOf(token));

      if (!publicKey) {
        throw new UnauthenticatedException();
      }

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { publicKey, algorithms: [ACCESS_TOKEN_ALGORITHM] },
      );

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

  // The `kid` out of the token's own header, read without verifying anything:
  // a JWT header is just base64url JSON in front of the first dot. Nothing
  // here is believed — the only use made of it is choosing which key to then
  // verify against, and a value naming no key chooses none.
  private keyIdOf(token: string): unknown {
    try {
      const [header] = token.split('.');
      const decoded: unknown = JSON.parse(
        Buffer.from(header, 'base64url').toString('utf8'),
      );

      return typeof decoded === 'object' && decoded !== null
        ? (decoded as { kid?: unknown }).kid
        : undefined;
    } catch {
      return undefined;
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

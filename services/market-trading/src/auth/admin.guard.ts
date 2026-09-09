import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import {
  ForbiddenException,
  UnauthenticatedException,
} from '../common/errors/api-exception';
import { AuthenticatedUser } from './authenticated-user';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

// docs/api/auth-v1.md §2.1, error-envelope.md §2 — admits only a token whose
// role claim is 'admin'. Everyone else is authenticated but not allowed, which
// is a 403: the token is valid and presenting it again will not help.
//
// Composed after JwtAuthGuard, which is what puts the role on the request:
//
//   @UseGuards(JwtAuthGuard, AdminGuard)
//
// Nest runs guards in the order listed, so JwtAuthGuard has already rejected an
// unauthenticated caller by the time this one runs. It does not depend on that
// having happened: a controller that lists this guard alone gets a 401 rather
// than an open route, because no user on the request means no proof of anyone,
// not proof of an investor.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user) {
      throw new UnauthenticatedException();
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException();
    }

    return true;
  }
}

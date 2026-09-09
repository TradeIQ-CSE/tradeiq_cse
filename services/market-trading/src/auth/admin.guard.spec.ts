import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import {
  ForbiddenException,
  UnauthenticatedException,
} from '../common/errors/api-exception';
import { AdminGuard } from './admin.guard';
import { AuthenticatedUser } from './authenticated-user';

type TestRequest = Request & { user?: AuthenticatedUser };

function createContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const USER_ID = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';

// The same cases as the other service's admin guard spec. Both must admit and
// refuse exactly the same users, for the same reason the JWT guards mirror each
// other: one service disagreeing about who is an admin is worse than either
// being wrong on its own.
describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('admits an admin', () => {
    const request = { user: { userId: USER_ID, role: 'admin' } } as TestRequest;

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  // 403 rather than 401: the token is valid and the caller is who they say they
  // are, so re-authenticating would not help (error-envelope.md §2).
  it('refuses an investor with 403 FORBIDDEN', () => {
    const request = {
      user: { userId: USER_ID, role: 'investor' },
    } as TestRequest;

    expect(() => guard.canActivate(createContext(request))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(createContext(request))).toThrow(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
  });

  // A controller that lists AdminGuard without JwtAuthGuard in front of it has
  // nobody on the request. That is an absence of proof, not proof of an
  // investor, so it fails closed as 401 — and it must never return true.
  it('refuses a request with no authenticated user', () => {
    const request = {} as TestRequest;

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnauthenticatedException,
    );
  });
});

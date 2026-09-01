import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { AuthenticatedUser } from './authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

type TestRequest = Request & { user?: AuthenticatedUser };

function createContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// Seconds since the epoch, the unit jsonwebtoken uses for exp.
const FUTURE_EXP = Math.floor(Date.now() / 1000) + 300;

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn();
  const jwtService = { verifyAsync } as unknown as JwtService;
  const guard = new JwtAuthGuard(jwtService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets the current user from a verified UUID subject', async () => {
    const userId = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';
    const request = {
      headers: { authorization: 'Bearer signed-token' },
    } as TestRequest;
    verifyAsync.mockResolvedValue({ sub: userId, exp: FUTURE_EXP });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('signed-token');
    expect(request.user).toEqual({ userId });
  });

  // docs/api/auth-v1.md §2.1 — verifyAsync enforces exp only when the claim is
  // there, so a token signed without one would otherwise never expire. Absence
  // of an expiry is treated as invalid, not as "valid forever".
  it.each([
    ['absent', undefined],
    ['a string', '9999999999'],
    ['null', null],
  ])('rejects a token whose exp is %s', async (_label, exp) => {
    const request = {
      headers: { authorization: 'Bearer signed-token' },
    } as TestRequest;
    verifyAsync.mockResolvedValue({
      sub: '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e',
      exp,
    });

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
    expect(request.user).toBeUndefined();
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer one two'])(
    'rejects a missing or malformed authorization header: %s',
    async (value) => {
      const request = {
        headers: value === undefined ? {} : { authorization: value },
      } as TestRequest;

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
      expect(verifyAsync).not.toHaveBeenCalled();
    },
  );

  it('rejects token verification errors without leaking details', async () => {
    const request = {
      headers: { authorization: 'Bearer bad-token' },
    } as TestRequest;
    verifyAsync.mockRejectedValue(new Error('signature details'));

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
  });

  it.each([undefined, 'not-a-uuid', 123])(
    'rejects an invalid token subject: %s',
    async (sub) => {
      const request = {
        headers: { authorization: 'Bearer signed-token' },
      } as TestRequest;
      verifyAsync.mockResolvedValue({ sub, exp: FUTURE_EXP });

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
      expect(request.user).toBeUndefined();
    },
  );
});

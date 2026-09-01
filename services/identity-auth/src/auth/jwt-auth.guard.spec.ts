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
    verifyAsync.mockResolvedValue({ sub: userId });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('signed-token');
    expect(request.user).toEqual({ userId });
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
      verifyAsync.mockResolvedValue({ sub });

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
      expect(request.user).toBeUndefined();
    },
  );
});

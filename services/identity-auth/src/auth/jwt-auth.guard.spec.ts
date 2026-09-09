import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { KeyObject } from 'crypto';
import { Request } from 'express';
import { UnauthenticatedException } from '../common/errors/api-exception';
import { AccessTokenKeyring } from './access-token-keyring';
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

// Verification is mocked here, so a token only has to be decodable: the guard
// reads its header to choose a key, and what these tests are about is that
// choice and the claim checks that follow it. Whether a signature is any good
// is a question about crypto rather than about this class, and is asked in
// test/*.e2e-spec.ts against a real keypair.
const KNOWN_KEY_ID = 'known-key-id';
const KEY = {} as KeyObject;

function tokenWithKeyId(kid?: string): string {
  const header = Buffer.from(
    JSON.stringify(
      kid === undefined ? { alg: 'RS256' } : { alg: 'RS256', kid },
    ),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify({})).toString('base64url');
  return `${header}.${payload}.signature`;
}

const SIGNED = tokenWithKeyId(KNOWN_KEY_ID);

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn();
  const jwtService = { verifyAsync } as unknown as JwtService;
  const keyring = {
    find: (kid: unknown) => (kid === KNOWN_KEY_ID ? KEY : undefined),
  } as AccessTokenKeyring;
  const guard = new JwtAuthGuard(jwtService, keyring);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets the current user from a verified UUID subject', async () => {
    const userId = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';
    const request = {
      headers: { authorization: `Bearer ${SIGNED}` },
    } as TestRequest;
    verifyAsync.mockResolvedValue({ sub: userId, exp: FUTURE_EXP });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith(SIGNED, {
      publicKey: KEY,
      algorithms: ['RS256'],
    });
    expect(request.user).toEqual({ userId, role: 'investor' });
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
      headers: { authorization: `Bearer ${SIGNED}` },
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
      headers: { authorization: `Bearer ${SIGNED}` },
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
        headers: { authorization: `Bearer ${SIGNED}` },
      } as TestRequest;
      verifyAsync.mockResolvedValue({ sub, exp: FUTURE_EXP });

      await expect(
        guard.canActivate(createContext(request)),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
      expect(request.user).toBeUndefined();
    },
  );

  // docs/api/auth-v1.md §2.1 — the role claim decides authorization, so it is
  // read strictly: only the exact string 'admin' is admin.
  //
  // The uppercase and unknown-string cases are the ones that matter. An
  // implementation written as `role !== 'investor'` passes every other case
  // here and silently promotes both of them to admin.
  it.each([
    ['admin', 'admin', 'admin'],
    ['investor', 'investor', 'investor'],
    ['absent', undefined, 'investor'],
    ['null', null, 'investor'],
    ['uppercase ADMIN', 'ADMIN', 'investor'],
    ['padded " admin "', ' admin ', 'investor'],
    ['an unknown role', 'superuser', 'investor'],
    ['a non-string', 1, 'investor'],
    ['an object', { role: 'admin' }, 'investor'],
  ])('reads role %s as %s', async (_label, claim, expected) => {
    const userId = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';
    const request = {
      headers: { authorization: `Bearer ${SIGNED}` },
    } as TestRequest;
    verifyAsync.mockResolvedValue({
      sub: userId,
      exp: FUTURE_EXP,
      role: claim,
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ userId, role: expected });
  });

  // docs/api/auth-v1.md §2 — the key a token is checked against is chosen by
  // its own `kid`, which is only safe because the value is looked up rather
  // than trusted. A token naming a key this service does not hold is refused
  // before any signature is checked, so it cannot bring its own key material.
  //
  // The absent case is the one worth having. A guard that falls back to "the
  // only key" when `kid` is missing passes every other test in this file and
  // then starts rejecting month-old tokens the first time a rotation adds a
  // second key.
  it.each([
    ['names an unknown key', tokenWithKeyId('some-other-key-id')],
    ['carries no key id', tokenWithKeyId()],
    ['is not a JWT at all', 'not-a-token'],
  ])('rejects a token that %s', async (_label, token) => {
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as TestRequest;

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });
});

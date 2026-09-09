import { generateKeyPairSync, randomUUID } from 'crypto';
import { Controller, Get, Module, Req, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AuthenticatedUser } from '../src/auth/authenticated-user';
import { AuthModule } from '../src/auth/auth.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { configureMarketTradingApp } from '../src/app.setup';
import authConfig from '../src/config/auth.config';

// TIQ-133. These are the acceptance criteria for moving access tokens to
// RS256, and they are e2e rather than unit tests on purpose: every one of them
// is a question about what the real verification path does with a real
// signature, which a mocked JwtService cannot answer.
//
// No database is touched — the route below exists only to be guarded.

@Controller('test-only')
class GuardedController {
  @Get('who')
  @UseGuards(JwtAuthGuard)
  who(@Req() request: Request & { user?: AuthenticatedUser }) {
    return { sub: request.user?.userId };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
    AuthModule,
  ],
  controllers: [GuardedController],
})
class VerificationTestModule {}

// A private key the application is never told about, used to sign tokens it
// must refuse. Kept out of TestSigner, which deliberately hands out only the
// public half of what it generates.
const UNKNOWN_PRIVATE_PEM = generateKeyPairSync('rsa', {
  modulusLength: 2048,
}).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

describe('Access token verification (e2e)', () => {
  let app: NestExpressApplication;
  let issuer: TestSigner;
  let retiring: TestSigner;
  let stranger: TestSigner;

  const SUB = randomUUID();

  const get = (token: string) =>
    request(app.getHttpServer())
      .get('/test-only/who')
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    issuer = createTestSigner();
    retiring = createTestSigner();
    stranger = createTestSigner();

    // Two keys in the ring: the shape a deployment has partway through a
    // rotation, and the only shape in which "pick the key by kid" is
    // distinguishable from "use the one key there is".
    process.env.AUTH_JWT_PUBLIC_KEYS = `${issuer.publicKeys},${retiring.publicKeys}`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [VerificationTestModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a token signed with the current key', async () => {
    const response = await get(issuer.sign({ sub: SUB })).expect(200);
    expect(response.body).toEqual({ sub: SUB });
  });

  // The point of the ring. A token signed before the rotation must keep
  // working until it expires; without this, rotating logs everyone out.
  it('accepts a token signed with a key still in the ring', async () => {
    const response = await get(retiring.sign({ sub: SUB })).expect(200);
    expect(response.body).toEqual({ sub: SUB });
  });

  it('rejects a token signed with a key that is not in the ring', async () => {
    await get(stranger.sign({ sub: SUB })).expect(401);
  });

  // The header is attacker-controlled, so claiming a `kid` the service holds
  // must not be enough — the signature still has to be that key's. This is
  // what separates looking a key up by `kid` from trusting the `kid`.
  it('rejects a token that borrows a known key id but is signed by another key', async () => {
    const forged = new JwtService({
      privateKey: UNKNOWN_PRIVATE_PEM,
      signOptions: {
        algorithm: 'RS256',
        keyid: issuer.keyId,
        expiresIn: '5m',
      },
    }).sign({ sub: SUB });

    await get(forged).expect(401);
  });

  // The algorithm-confusion attack RS256 invites, and the reason
  // `algorithms: ['RS256']` is pinned rather than left to the token. The
  // public key is published to every verifier; if HS256 were accepted, that
  // published key doubles as an HMAC secret and anyone holding it can mint a
  // token for any user id — exactly the hole this change closed.
  it('rejects a token re-signed HS256 with the public key as the secret', async () => {
    const publicPem = Buffer.from(issuer.publicKeys, 'base64').toString('utf8');
    const confused = new JwtService({
      secret: publicPem,
      signOptions: {
        algorithm: 'HS256',
        keyid: issuer.keyId,
        expiresIn: '5m',
      },
    }).sign({ sub: SUB });

    await get(confused).expect(401);
  });

  it('rejects an unsigned token claiming alg: none', async () => {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = [
      part({ alg: 'none', typ: 'JWT', kid: issuer.keyId }),
      part({ sub: SUB, exp: Math.floor(Date.now() / 1000) + 300 }),
      '',
    ].join('.');

    await get(unsigned).expect(401);
  });

  // Signed with a key the ring holds, so the only thing wrong with it is the
  // missing `kid`. An implementation that falls back to "the one key there is"
  // accepts this and passes every other case in this file, right up until a
  // rotation puts a second key in the ring and month-old tokens start failing.
  it('rejects a token carrying no key id at all', async () => {
    await get(issuer.signWithoutKeyId({ sub: SUB })).expect(401);
  });

  it('answers an unauthenticated request with the envelope, not a stack trace', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/who')
      .expect(401);

    expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

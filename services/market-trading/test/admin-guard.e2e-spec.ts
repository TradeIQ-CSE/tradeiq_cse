import { randomUUID } from 'crypto';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AdminGuard } from '../src/auth/admin.guard';
import { AuthModule } from '../src/auth/auth.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { configureMarketTradingApp } from '../src/app.setup';
import authConfig from '../src/config/auth.config';

// TIQ-131. There is no admin route in this service yet — the first one arrives
// with the admin fee schedule (TIQ-132) — so the guard is mounted here on a
// controller that exists only for this file. Inventing a real endpoint to have
// something to test would ship an API nobody asked for.
//
// The unit specs already cover the guard's decision. What this adds is the part
// they cannot: that the guard resolves through Nest's DI, that it composes with
// JwtAuthGuard in the declared order, and that a refusal leaves the app as the
// documented error envelope rather than an unhandled 500.
@Controller('test-only/admin')
class AdminOnlyController {
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  read(): { data: { ok: true } } {
    return { data: { ok: true } };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
    AuthModule,
  ],
  controllers: [AdminOnlyController],
})
class AdminGuardTestModule {}

describe('AdminGuard (e2e)', () => {
  let app: NestExpressApplication;
  let signer: TestSigner;

  const sign = (role?: string) =>
    signer.sign(
      role === undefined ? { sub: randomUUID() } : { sub: randomUUID(), role },
    );

  beforeAll(async () => {
    signer = createTestSigner();
    process.env.AUTH_JWT_PUBLIC_KEYS = signer.publicKeys;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AdminGuardTestModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('admits an admin token', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/admin')
      .set('Authorization', `Bearer ${sign('admin')}`)
      .expect(200);

    expect(response.body).toEqual({ data: { ok: true } });
  });

  // The acceptance criterion: an investor's token is refused with 403, and the
  // refusal arrives as the registered envelope code, not a bare Nest 403.
  it('refuses an investor token with a 403 FORBIDDEN envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/admin')
      .set('Authorization', `Bearer ${sign('investor')}`)
      .expect(403);

    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN' });
    expect(response.body.error.trace_id).toEqual(expect.any(String));
  });

  // Nothing outside the signed token may grant admin. Each of these is a shape
  // a caller could try by hand against a service that trusted request input.
  it.each([
    ['no role claim', undefined],
    ['an unknown role', 'superuser'],
    ['uppercase ADMIN', 'ADMIN'],
  ])('refuses a token with %s', async (_label, role) => {
    await request(app.getHttpServer())
      .get('/test-only/admin')
      .set('Authorization', `Bearer ${sign(role)}`)
      .expect(403);
  });

  it.each([
    ['a role header', 'x-user-role'],
    ['an admin header', 'x-admin'],
  ])('does not grant admin from %s', async (_label, header) => {
    await request(app.getHttpServer())
      .get('/test-only/admin')
      .set('Authorization', `Bearer ${sign('investor')}`)
      .set(header, 'admin')
      .expect(403);
  });

  it('refuses an unauthenticated request with 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-only/admin')
      .expect(401);

    expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

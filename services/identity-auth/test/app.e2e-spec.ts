import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureIdentityAuthApp } from '../src/app.setup';
import { AuthenticatedUser } from '../src/auth/authenticated-user';
import { CurrentUser } from '../src/auth/current-user.decorator';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('test/protected')
class ProtectedTestController {
  @Get()
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

// Stands in for a controller that reads the current user but forgets its
// guard. Guards are opt-in per controller, so this mistake has to fail closed.
@Controller('test/unguarded')
class UnguardedTestController {
  @Get()
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedTestController, UnguardedTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureIdentityAuthApp(app);
    await app.init();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'identity-auth' });
  });

  it('rejects a protected route without a token', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/protected')
      .expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required.',
      },
    });
    expect(response.body.error.trace_id).toEqual(expect.any(String));
  });

  it('rejects a route that reads the current user without a guard', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/unguarded')
      .expect(401);

    expect(response.body.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
  });

  it('returns the verified token subject as the current user', async () => {
    const userId = '6fbd34d3-bd63-4fcb-ac7e-3cf92f52b61e';
    const token = await jwtService.signAsync(
      { sub: userId },
      { expiresIn: '5m' },
    );

    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .set('X-User-Id', 'd8e8c6aa-02d5-4b44-8382-c8da8729f540')
      .expect(200)
      .expect({ userId });
  });

  it('rejects an expired token with the same safe error', async () => {
    const token = await jwtService.signAsync(
      { sub: '3bf8d7e1-9e61-4c58-9e02-73621fbbd130' },
      { expiresIn: -1 },
    );

    const response = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
    expect(JSON.stringify(response.body)).not.toContain('expired');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await jwtService.signAsync(
      { sub: '7be918e8-53b2-46e4-b114-0a938d2912ad' },
      { secret: 'different-secret', expiresIn: '5m' },
    );

    const response = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
    expect(JSON.stringify(response.body)).not.toContain('signature');
  });
});

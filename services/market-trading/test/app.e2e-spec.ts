import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'market-trading' });
  });

  it('/market/overview (GET) ranks the seeded EOD session', async () => {
    const path = '/market/overview?as_of=2025-01-05&limit=2';
    const response = await request(app.getHttpServer()).get(path).expect(200);
    const repeated = await request(app.getHttpServer()).get(path).expect(200);

    expect(response.body.data.as_of).toBe('2025-01-03');
    expect(repeated.body).toEqual(response.body);
    expect(response.body.data.gainers).toEqual([
      {
        rank: 1,
        symbol: 'HNB.N0000',
        company_name: 'Hatton National Bank PLC',
        close: 257.12,
        change: 3.34,
        change_pct: 1.32,
        volume: 1517594,
      },
      {
        rank: 2,
        symbol: 'COMB.N0000',
        company_name: 'Commercial Bank of Ceylon PLC',
        close: 147.15,
        change: 1.34,
        change_pct: 0.92,
        volume: 1197713,
      },
    ]);
    expect(response.body.data.losers).toEqual([
      {
        rank: 1,
        symbol: 'SAMP.N0000',
        company_name: 'Sampath Bank PLC',
        close: 81.54,
        change: -1.51,
        change_pct: -1.82,
        volume: 528197,
      },
      {
        rank: 2,
        symbol: 'JKH.N0000',
        company_name: 'John Keells Holdings PLC',
        close: 22.32,
        change: -0.11,
        change_pct: -0.49,
        volume: 785056,
      },
    ]);
    expect(response.body.data.most_active).toEqual([
      {
        rank: 1,
        symbol: 'HNB.N0000',
        company_name: 'Hatton National Bank PLC',
        close: 257.12,
        change: 3.34,
        change_pct: 1.32,
        volume: 1517594,
      },
      {
        rank: 2,
        symbol: 'CTC.N0000',
        company_name: 'Ceylon Tobacco Company PLC',
        close: 965.36,
        change: 1.32,
        change_pct: 0.14,
        volume: 1382176,
      },
    ]);
  });
});

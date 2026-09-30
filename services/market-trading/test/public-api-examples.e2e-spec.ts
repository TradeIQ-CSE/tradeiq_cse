import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const executeCurl = promisify(execFile);
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';
import { createPublicApiDocument } from '../src/public-api/openapi/public-api-docs';
import { WORKED_EXAMPLES } from '../src/public-api/openapi/worked-examples';
import {
  generateApiKey,
  hashApiKey,
  keyPrefix,
} from '../src/developer-api/api-key';
import { responseValidator } from './schema-validation';

// Opt in ONLY on an explicitly disposable, EMPTY database. CI runs this
// before importing its sample; the ordinary saved-data suite never opts in.
const fixtureSuite =
  process.env.PUBLIC_API_REFERENCE_FIXTURE_TESTS === '1'
    ? describe
    : describe.skip;
fixtureSuite(
  'Published request/response pairs against isolated fixtures',
  () => {
    let app: NestExpressApplication;
    let db: DataSource;
    let seeded = false;
    let base: string;
    const ids = {
      comb: randomUUID(),
      jkh: randomUUID(),
      sector: randomUUID(),
      run: randomUUID(),
      key: randomUUID(),
      user: randomUUID(),
    };
    const secret = generateApiKey();
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>();
      configureMarketTradingApp(app);
      await app.init();
      db = app.get(DataSource);
      const counts = await db.query(
        'SELECT (SELECT count(*) FROM market_data.securities) + (SELECT count(*) FROM market_data.indices) AS count',
      );
      if (Number(counts[0].count) !== 0)
        throw new Error(
          'Reference fixtures require an EMPTY disposable database; refusing to modify existing market data',
        );
      seeded = true;
      await db.query(
        'INSERT INTO market_data.sectors(sector_id,gics_code,sector_name) VALUES($1,$2,$3)',
        [ids.sector, '4010', 'Banks'],
      );
      await db.query(
        'INSERT INTO market_data.securities(security_id,symbol,cse_code,company_name,sector_id,shares_outstanding,data_from,data_to) VALUES($1,$2,$2,$3,$4,$5,$6,$7),($8,$9,$9,$10,NULL,NULL,$11,$12)',
        [
          ids.comb,
          'COMB.N0000',
          'Commercial Bank of Ceylon PLC',
          ids.sector,
          1467151555,
          '2025-12-31',
          '2025-12-31',
          ids.jkh,
          'JKH.N0000',
          'John Keells Holdings PLC',
          '2025-01-02',
          '2025-01-03',
        ],
      );
      await db.query(
        "INSERT INTO market_data.trading_calendar(trade_date,is_trading_day) VALUES('2025-01-02',true),('2025-01-03',true),('2025-12-31',true)",
      );
      await db.query(
        "INSERT INTO market_data.ingestion_runs(run_id,trigger_type,status) VALUES($1,'manual','succeeded')",
        [ids.run],
      );
      await db.query(
        "INSERT INTO market_data.daily_prices(security_id,trade_date,open,high,low,close,volume,ingestion_run_id) VALUES($1,'2025-01-02',NULL,22.59,22.13,22.43,1631334,$3),($1,'2025-01-03',22.43,22.84,21.75,22.73,2000000,$3),($2,'2025-12-31',90.1,90.55,88.9,89.7,512800,$3)",
        [ids.jkh, ids.comb, ids.run],
      );
      await db.query(
        "INSERT INTO market_data.indices(index_code,index_name) VALUES('ASPI','All Share Price Index'),('SL20','S&P Sri Lanka 20')",
      );
      await db.query(
        "INSERT INTO market_data.index_values(index_value_id,index_code,trade_date,index_value) VALUES($1,'SL20','2025-01-02',4732.06),($2,'SL20','2025-01-03',4740.06)",
        [randomUUID(), randomUUID()],
      );
      await db.query(
        'INSERT INTO market_data.api_keys(api_key_id,user_id,key_hash,key_prefix,label) VALUES($1,$2,$3,$4,$5)',
        [
          ids.key,
          ids.user,
          hashApiKey(secret),
          keyPrefix(secret),
          'Disposable published-example fixture',
        ],
      );
      await app.listen(0, '127.0.0.1');
      base = await app.getUrl();
    });
    afterAll(async () => {
      if (seeded) {
        await db.query(
          'DELETE FROM market_data.api_key_usage WHERE api_key_id=$1',
          [ids.key],
        );
        await db.query('DELETE FROM market_data.api_keys WHERE api_key_id=$1', [
          ids.key,
        ]);
        await db.query(
          'DELETE FROM market_data.daily_prices WHERE security_id=ANY($1)',
          [[ids.comb, ids.jkh]],
        );
        await db.query(
          'DELETE FROM market_data.securities WHERE security_id=ANY($1)',
          [[ids.comb, ids.jkh]],
        );
        await db.query('DELETE FROM market_data.sectors WHERE sector_id=$1', [
          ids.sector,
        ]);
        await db.query(
          "DELETE FROM market_data.index_values WHERE index_code IN ('ASPI','SL20')",
        );
        await db.query(
          "DELETE FROM market_data.indices WHERE index_code IN ('ASPI','SL20')",
        );
        await db.query(
          'DELETE FROM market_data.ingestion_runs WHERE run_id=$1',
          [ids.run],
        );
        await db.query(
          "DELETE FROM market_data.trading_calendar WHERE trade_date IN ('2025-01-02','2025-01-03','2025-12-31')",
        );
      }
      await app?.close();
    });
    it('executes all thirteen exact generated curl request paths and validates matching responses', async () => {
      const document = createPublicApiDocument(app);
      let checked = 0;
      for (const [path, examples] of Object.entries(WORKED_EXAMPLES)) {
        const response = document.paths[path].get!.responses[
          '200'
        ] as import('@nestjs/swagger').ResponseObject;
        const media = response.content?.['application/json'];
        if (!media?.schema)
          throw new Error('Published response schema is missing');
        const validate = responseValidator(document, media.schema);
        for (const example of Object.values(examples)) {
          const url = `${base}/public/v1${example['x-request']}`;
          // Same arguments as the generated public curl examples; only origin
          // and YOUR_KEY are replaced with this disposable local fixture.
          const result = await executeCurl(
            'curl',
            [
              '--silent',
              '--show-error',
              '--fail-with-body',
              url,
              '-H',
              `X-API-Key: ${secret}`,
            ],
            { encoding: 'utf8', timeout: 10000 },
          );
          const actual = JSON.parse(result.stdout);
          expect(validate(actual)).toBe(true);
          expect(actual).toEqual(example.value);
          const viaAdapter = await request(app.getHttpServer())
            .get(`/public/v1${example['x-request']}`)
            .set('X-API-Key', secret)
            .expect(200);
          expect(viaAdapter.body).toEqual(example.value);
          checked++;
        }
      }
      expect(checked).toBe(13);
    });
  },
);

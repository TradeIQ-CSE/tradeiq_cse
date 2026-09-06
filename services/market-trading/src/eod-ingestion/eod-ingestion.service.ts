import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  IngestionConflictException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { toIsoDate } from '../common/market-date';
import {
  EodIngestionReceipt,
  EodIngestionRequest,
} from './eod-ingestion.types';

interface RunRow {
  batch_id: string;
  trading_date: Date | string;
  status: string;
  market_digest: string;
  records_processed: number;
  records_accepted: number;
  records_quarantined: number;
  started_at: Date | string;
  completed_at: Date | string;
}

interface SecurityRow {
  security_id: string;
  symbol: string;
}

function timestamp(value: Date | string): string {
  return typeof value === 'string'
    ? new Date(value).toISOString()
    : value.toISOString();
}

function receipt(row: RunRow, replayed: boolean): EodIngestionReceipt {
  return {
    batch_id: row.batch_id,
    trade_date: toIsoDate(row.trading_date),
    status: row.status,
    market_digest: row.market_digest,
    records_processed: Number(row.records_processed),
    records_accepted: Number(row.records_accepted),
    records_quarantined: Number(row.records_quarantined),
    started_at: timestamp(row.started_at),
    completed_at: timestamp(row.completed_at),
    replayed,
  };
}

const RUN_COLUMNS = `
  batch_id, trading_date, status, market_digest,
  records_processed, records_accepted, records_quarantined,
  started_at, completed_at
`;
const SERIALIZATION_FAILURE = '40001';
const MAX_SERIALIZATION_ATTEMPTS = 3;
const SERIALIZATION_RETRY_DELAY_MS = 25;

function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as Record<string, unknown>;
  if (typeof value.code === 'string') return value.code;
  const driverError = value.driverError;
  if (driverError && typeof driverError === 'object') {
    const code = (driverError as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

@Injectable()
export class EodIngestionService {
  constructor(private readonly dataSource: DataSource) {}

  async findLatest(): Promise<EodIngestionReceipt | null> {
    const rows: RunRow[] = await this.dataSource.query(
      `SELECT ${RUN_COLUMNS}
       FROM market_data.ingestion_runs
       WHERE batch_id IS NOT NULL AND status = 'succeeded'
       ORDER BY trading_date DESC, completed_at DESC
       LIMIT 1`,
    );
    return rows[0] ? receipt(rows[0], false) : null;
  }

  async findByBatchId(batchId: string): Promise<EodIngestionReceipt | null> {
    const rows: RunRow[] = await this.dataSource.query(
      `SELECT ${RUN_COLUMNS}
       FROM market_data.ingestion_runs WHERE batch_id = $1`,
      [batchId],
    );
    return rows[0] ? receipt(rows[0], false) : null;
  }

  async ingest(input: EodIngestionRequest): Promise<EodIngestionReceipt> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.ingestAttempt(input);
      } catch (error) {
        if (
          postgresErrorCode(error) !== SERIALIZATION_FAILURE ||
          attempt === MAX_SERIALIZATION_ATTEMPTS - 1
        ) {
          throw error;
        }
        await wait(SERIALIZATION_RETRY_DELAY_MS * 2 ** attempt);
      }
    }
    throw new Error('EOD ingestion retry loop exhausted');
  }

  private async ingestAttempt(
    input: EodIngestionRequest,
  ): Promise<EodIngestionReceipt> {
    const existing = await this.findRun(input.batch_id);
    if (existing) {
      if (existing.market_digest !== input.market_digest) {
        throw new IngestionConflictException(
          'The batch ID has already been used with different content.',
        );
      }
      if (existing.status !== 'succeeded') {
        throw new IngestionConflictException(
          'The batch ID belongs to a previously rejected ingestion.',
        );
      }
      return receipt(existing, true);
    }

    const staleRows: { trading_date: Date | string }[] =
      await this.dataSource.query(
        `SELECT trading_date FROM market_data.ingestion_runs
         WHERE status = 'succeeded' AND market_digest = $1
           AND trading_date IS DISTINCT FROM $2::date
         LIMIT 1`,
        [input.market_digest, input.trade_date],
      );
    if (staleRows.length > 0) {
      const fields = [
        {
          field: 'market_digest',
          reason: `repeats the accepted snapshot from ${toIsoDate(staleRows[0].trading_date)}`,
        },
      ];
      await this.recordRejected(input, fields);
      throw new ValidationFailedException(fields);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction('SERIALIZABLE');
      // One daily batch changes the shared latest-market boundary. Serialise
      // competing deliveries so two dates cannot both pass the stale/date
      // checks against the same pre-commit state.
      await queryRunner.manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('market_data.eod_ingestion'))`,
      );
      const concurrent = await this.findRun(
        input.batch_id,
        queryRunner.manager,
      );
      if (concurrent) {
        await queryRunner.rollbackTransaction();
        if (
          concurrent.status === 'succeeded' &&
          concurrent.market_digest === input.market_digest
        ) {
          return receipt(concurrent, true);
        }
        throw new IngestionConflictException(
          'The batch ID was committed concurrently with different content.',
        );
      }

      const concurrentStale: { trading_date: Date | string }[] =
        await queryRunner.manager.query(
          `SELECT trading_date FROM market_data.ingestion_runs
           WHERE status = 'succeeded' AND market_digest = $1
             AND trading_date IS DISTINCT FROM $2::date
           LIMIT 1`,
          [input.market_digest, input.trade_date],
        );
      if (concurrentStale.length > 0) {
        throw new ValidationFailedException([
          {
            field: 'market_digest',
            reason: `repeats the accepted snapshot from ${toIsoDate(concurrentStale[0].trading_date)}`,
          },
        ]);
      }

      await this.assertDateAvailable(queryRunner.manager, input);
      const runId = randomUUID();
      await queryRunner.manager.query(
        `INSERT INTO market_data.ingestion_runs (
           run_id, trigger_type, triggered_by_name, status,
           records_processed, records_accepted, records_quarantined,
           batch_id, contract_version, trading_date, source_name, captured_at,
           source_date_method, raw_payload_hash, market_digest,
           producer_commit, action_run_url, validation_summary
         ) VALUES (
           $1, 'scheduled', 'cse-dataset', 'running',
           $2, 0, 0, $3, $4, $5::date, $6, $7::timestamptz,
           $8, $9, $10, $11, $12, $13::jsonb
         )`,
        [
          runId,
          input.validation.processed,
          input.batch_id,
          input.contract_version,
          input.trade_date,
          input.source.name,
          input.source.captured_at,
          input.source.source_date_method,
          input.source.raw_payload_hash,
          input.market_digest,
          input.source.producer_commit ?? null,
          input.source.action_run_url ?? null,
          JSON.stringify({ ...input.validation, calendar: input.calendar }),
        ],
      );

      await queryRunner.manager.query(
        `INSERT INTO market_data.trading_calendar (trade_date, is_trading_day, note)
         VALUES ($1::date, true, $2)
         ON CONFLICT (trade_date) DO NOTHING`,
        [
          input.trade_date,
          `Verified by ${input.calendar.source}`.slice(0, 100),
        ],
      );

      const securityIds = new Map<string, string>();
      for (const security of input.securities) {
        const securityId = randomUUID();
        const rows: SecurityRow[] = await queryRunner.manager.query(
          `INSERT INTO market_data.securities (
             security_id, symbol, cse_code, company_name, shares_outstanding,
             data_from, data_to
           ) VALUES ($1, $2, $3, $4, $5::bigint, $6::date, $6::date)
           ON CONFLICT (symbol) DO UPDATE SET
             cse_code = COALESCE(EXCLUDED.cse_code, market_data.securities.cse_code),
             company_name = CASE
               WHEN EXCLUDED.company_name <> 'Unknown'
                 THEN EXCLUDED.company_name
               ELSE market_data.securities.company_name
             END,
             shares_outstanding = COALESCE(
               EXCLUDED.shares_outstanding,
               market_data.securities.shares_outstanding
             )
           RETURNING security_id, symbol`,
          [
            securityId,
            security.symbol,
            security.cse_code ?? security.symbol,
            security.company_name,
            security.shares_outstanding ?? null,
            input.trade_date,
          ],
        );
        securityIds.set(rows[0].symbol, rows[0].security_id);
      }

      for (const price of input.prices) {
        const securityId = securityIds.get(price.symbol);
        if (!securityId)
          throw new Error(`Missing security ID for ${price.symbol}`);
        await queryRunner.manager.query(
          `INSERT INTO market_data.daily_prices (
             security_id, trade_date, open, high, low, close, volume,
             ingestion_run_id
           ) VALUES ($1, $2::date, $3::numeric, $4::numeric, $5::numeric,
                     $6::numeric, $7::bigint, $8)`,
          [
            securityId,
            input.trade_date,
            price.open,
            price.high,
            price.low,
            price.close,
            price.volume,
            runId,
          ],
        );
        await queryRunner.manager.query(
          `INSERT INTO market_data.daily_price_provenance (
             security_id, trade_date, ingestion_run_id, source_name,
             raw_payload_hash, validation_warnings, ohlc_repaired
           ) VALUES ($1, $2::date, $3, $4, $5, $6::jsonb, $7)`,
          [
            securityId,
            input.trade_date,
            runId,
            input.source.name,
            input.source.raw_payload_hash,
            JSON.stringify(price.validation_warnings),
            price.ohlc_repaired,
          ],
        );
      }

      const ids = [...securityIds.values()];
      await queryRunner.manager.query(
        `UPDATE market_data.securities
         SET data_from = LEAST(COALESCE(data_from, $2::date), $2::date),
             data_to = GREATEST(COALESCE(data_to, $2::date), $2::date)
         WHERE security_id = ANY($1::uuid[])`,
        [ids, input.trade_date],
      );
      await this.rebuildAggregates(queryRunner.manager, ids, input.trade_date);

      await queryRunner.manager.query(
        `UPDATE market_data.ingestion_runs
         SET completed_at = now(), status = 'succeeded', records_accepted = $2
         WHERE run_id = $1`,
        [runId, input.prices.length],
      );
      const completed = await this.findRun(input.batch_id, queryRunner.manager);
      if (!completed) throw new Error('Committed ingestion receipt is missing');
      await queryRunner.commitTransaction();
      return receipt(completed, false);
    } catch (error) {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      if (
        error instanceof IngestionConflictException ||
        error instanceof ValidationFailedException
      ) {
        await this.recordRejected(input, [
          ...(error.fields ?? [{ field: 'batch', reason: error.message }]),
        ]);
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findRun(
    batchId: string,
    manager: EntityManager | DataSource = this.dataSource,
  ): Promise<RunRow | null> {
    const rows: RunRow[] = await manager.query(
      `SELECT ${RUN_COLUMNS} FROM market_data.ingestion_runs WHERE batch_id = $1`,
      [batchId],
    );
    return rows[0] ?? null;
  }

  private async assertDateAvailable(
    manager: EntityManager,
    input: EodIngestionRequest,
  ): Promise<void> {
    const closed: { is_trading_day: boolean }[] = await manager.query(
      `SELECT is_trading_day FROM market_data.trading_calendar WHERE trade_date = $1::date`,
      [input.trade_date],
    );
    if (closed[0]?.is_trading_day === false) {
      throw new IngestionConflictException(
        'The submitted date is recorded as a non-trading day.',
      );
    }
    const existing: { symbol: string }[] = await manager.query(
      `SELECT s.symbol
       FROM market_data.daily_prices p
       JOIN market_data.securities s ON s.security_id = p.security_id
       WHERE p.trade_date = $1::date
       LIMIT 1`,
      [input.trade_date],
    );
    if (existing.length > 0) {
      throw new IngestionConflictException(
        `Market prices already exist for ${input.trade_date}; corrections require a separate workflow.`,
      );
    }
  }

  private async rebuildAggregates(
    manager: EntityManager,
    securityIds: string[],
    tradeDate: string,
  ): Promise<void> {
    for (const periodType of ['weekly', 'monthly'] as const) {
      const trunc = periodType === 'weekly' ? 'week' : 'month';
      await manager.query(
        `DELETE FROM market_data.price_aggregates
         WHERE security_id = ANY($1::uuid[])
           AND period_type = $2
           AND period_start = date_trunc('${trunc}', $3::date)::date`,
        [securityIds, periodType, tradeDate],
      );
      await manager.query(
        `INSERT INTO market_data.price_aggregates (
           aggregate_id, security_id, period_type, period_start, period_end,
           open, high, low, close, volume
         )
         SELECT
           md5(p.security_id::text || ':' || $2 || ':' || date_trunc('${trunc}', p.trade_date)::date::text)::uuid,
           p.security_id, $2, date_trunc('${trunc}', p.trade_date)::date,
           max(p.trade_date),
           (array_agg(p.open ORDER BY p.trade_date) FILTER (WHERE p.open IS NOT NULL))[1],
           max(p.high), min(p.low),
           (array_agg(p.close ORDER BY p.trade_date DESC))[1],
           sum(p.volume)
         FROM market_data.daily_prices p
         WHERE p.security_id = ANY($1::uuid[])
           AND date_trunc('${trunc}', p.trade_date)::date = date_trunc('${trunc}', $3::date)::date
         GROUP BY p.security_id, date_trunc('${trunc}', p.trade_date)::date`,
        [securityIds, periodType, tradeDate],
      );
    }
  }

  private async recordRejected(
    input: EodIngestionRequest,
    fields: { field: string; reason: string }[],
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO market_data.ingestion_runs (
         run_id, completed_at, trigger_type, triggered_by_name,
         records_processed, records_accepted, records_quarantined, status,
         batch_id, contract_version, trading_date, source_name, captured_at,
         source_date_method, raw_payload_hash, market_digest,
         producer_commit, action_run_url, validation_summary, error_details
       ) VALUES (
         $1, now(), 'scheduled', 'cse-dataset', $2, 0, $2, 'failed',
         $3, $4, $5::date, $6, $7::timestamptz, $8, $9, $10, $11, $12,
         $13::jsonb, $14::jsonb
       ) ON CONFLICT (batch_id) WHERE batch_id IS NOT NULL DO NOTHING`,
      [
        randomUUID(),
        input.validation.processed,
        input.batch_id,
        input.contract_version,
        input.trade_date,
        input.source.name,
        input.source.captured_at,
        input.source.source_date_method,
        input.source.raw_payload_hash,
        input.market_digest,
        input.source.producer_commit ?? null,
        input.source.action_run_url ?? null,
        JSON.stringify(input.validation),
        JSON.stringify(fields),
      ],
    );
  }
}

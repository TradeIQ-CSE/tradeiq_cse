import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  IngestionConflictException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { IndexIngestionDto } from './index-ingestion.dto';

// docs/api/index-ingestion-v1.md. Each index has one close per day: the same
// close again changes nothing, so a day can be re-sent or completed later, and
// a different close refuses the whole batch.
@Injectable()
export class IndexIngestionService {
  constructor(private readonly dataSource: DataSource) {}

  ingest(body: IndexIngestionDto) {
    const date = body.trade_date;
    const codes = body.values.map((value) => value.code);
    return this.dataSource.transaction(async (manager) => {
      // Requests for the same day take turns, so a concurrent duplicate gets
      // the unchanged or 409 answer rather than a key violation.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('index_ingestion:' || $1))`,
        [date],
      );
      const known: { index_code: string }[] = await manager.query(
        `SELECT index_code FROM market_data.indices
         WHERE index_code = ANY($1::text[])`,
        [codes],
      );
      const knownCodes = new Set(known.map((row) => row.index_code));
      const unknown = codes.flatMap((code, index) =>
        knownCodes.has(code)
          ? []
          : [{ field: `values.${index}.code`, reason: 'is not a known index' }],
      );
      if (unknown.length > 0) throw new ValidationFailedException(unknown);

      const day: { is_trading_day: boolean }[] = await manager.query(
        `SELECT is_trading_day FROM market_data.trading_calendar
         WHERE trade_date = $1::date`,
        [date],
      );
      if (day[0]?.is_trading_day === false) {
        throw new IngestionConflictException(
          `${date} is recorded as a non-trading day.`,
        );
      }
      if (day.length === 0) {
        await manager.query(
          `INSERT INTO market_data.trading_calendar (trade_date, is_trading_day, note)
           VALUES ($1::date, true, $2)`,
          [date, `Verified by ${body.calendar.source}`.slice(0, 100)],
        );
      }

      const rows: { index_code: string; close: string }[] = await manager.query(
        `SELECT index_code, index_value AS close FROM market_data.index_values
         WHERE trade_date = $1::date AND index_code = ANY($2::text[])`,
        [date, codes],
      );
      const stored = new Map(rows.map((row) => [row.index_code, row.close]));
      const changed = body.values.filter(
        (value) =>
          stored.has(value.code) &&
          Number(stored.get(value.code)) !== Number(value.close),
      );
      if (changed.length > 0) {
        throw new IngestionConflictException(
          `${changed.map((value) => value.code).join(', ')} already has a different close for ${date}.`,
        );
      }

      const added = body.values.filter((value) => !stored.has(value.code));
      for (const value of added) {
        await manager.query(
          `INSERT INTO market_data.index_values (
             index_value_id, index_code, trade_date, index_value
           ) VALUES ($1, $2, $3::date, $4::numeric)`,
          [randomUUID(), value.code, date, value.close],
        );
      }
      return {
        data: {
          trade_date: date,
          stored: added.map((value) => value.code),
          unchanged: codes.filter((code) => stored.has(code)),
        },
      };
    });
  }
}

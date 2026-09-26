import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// docs/api/public-api-v1.md §8 — every key-resolved request (2xx, 4xx, 429
// alike) upserts today's row in market_data.api_key_usage and refreshes
// last_used_at at most once a minute. ApiKeyGuard calls record() from a
// res.on('finish') listener, fire-and-forget: usage bookkeeping must never
// add latency to, or fail, the response it is counting.
@Injectable()
export class ApiKeyUsageRecorder {
  private readonly logger = new Logger(ApiKeyUsageRecorder.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Synchronous on purpose: callers (ApiKeyGuard's 'finish' listener) must
  // never await this, so a slow or failing write can't hold a response open
  // or throw out of an event handler.
  record(apiKeyId: string): void {
    this.recordAsync(apiKeyId).catch((err) => {
      this.logger.warn(
        `Could not record API key usage for ${apiKeyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async recordAsync(apiKeyId: string): Promise<void> {
    // usage_date is UTC "today", matching the daily columns everywhere else
    // in this contract (DeveloperKeysService.dailyUsage).
    const usageDate = new Date().toISOString().slice(0, 10);

    await this.dataSource.query(
      `INSERT INTO market_data.api_key_usage (api_key_id, usage_date, request_count)
       VALUES ($1, $2::date, 1)
       ON CONFLICT (api_key_id, usage_date)
         DO UPDATE SET request_count = market_data.api_key_usage.request_count + 1`,
      [apiKeyId, usageDate],
    );

    // At most once a minute per key, so a burst of requests writes this row
    // once rather than on every single request.
    await this.dataSource.query(
      `UPDATE market_data.api_keys
       SET last_used_at = now()
       WHERE api_key_id = $1
         AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
      [apiKeyId],
    );
  }
}

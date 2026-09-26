import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { ApiKeyCache } from '../api-key-cache/api-key-cache.service';
import { hashApiKey, isWellFormedApiKey } from '../developer-api/api-key';
import { InvalidApiKeyException } from '../common/errors/api-exception';
import { ApiKeyUsageRecorder } from './api-key-usage-recorder.service';

export interface ResolvedApiKey {
  apiKeyId: string;
}

export type ApiKeyAuthenticatedRequest = Request & { apiKey?: ResolvedApiKey };

interface ActiveKeyIdRow {
  api_key_id: string;
}

// docs/api/public-api-v1.md §2 — every /public/v1 route's authentication.
// A missing header, a malformed key, an unknown key and a revoked key all
// throw the identical InvalidApiKeyException, so the response never
// discloses which of the four it was.
//
// The key is read only from the X-API-Key header, never a query string
// (§2): nothing here ever inspects request.query.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: ApiKeyCache,
    private readonly usageRecorder: ApiKeyUsageRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<ApiKeyAuthenticatedRequest>();
    const response = httpContext.getResponse<Response>();

    const header = request.headers['x-api-key'];
    const value = Array.isArray(header) ? header[0] : header;

    if (!value || !isWellFormedApiKey(value)) {
      throw new InvalidApiKeyException();
    }

    const hash = hashApiKey(value);
    const resolved = await this.resolve(hash);
    if (!resolved) {
      throw new InvalidApiKeyException();
    }

    request.apiKey = resolved;

    // Every request that resolves a key counts, 2xx/4xx/429 alike
    // (docs/api/public-api-v1.md §8) — 'finish' fires once the response is
    // fully sent regardless of status code, and fire-and-forget so usage
    // bookkeeping never adds latency to, or can fail, the response itself.
    response.on('finish', () => this.usageRecorder.record(resolved.apiKeyId));

    return true;
  }

  private async resolve(hash: string): Promise<ResolvedApiKey | undefined> {
    const cached = this.cache.get(hash);
    if (cached) return cached;

    const rows: ActiveKeyIdRow[] = await this.dataSource.query(
      `SELECT api_key_id FROM market_data.api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL
       LIMIT 1`,
      [hash],
    );
    if (rows.length === 0) return undefined;

    const resolved: ResolvedApiKey = { apiKeyId: rows[0].api_key_id };
    this.cache.set(hash, resolved.apiKeyId);
    return resolved;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DependencyUnavailableException } from '../common/errors/api-exception';

export type ListingStatus = 'listed' | 'suspended' | 'delisted';

// docs/api/paper-trading-v1.md §2.3 — the response shape of
// GET /internal/paper-trading/quotes/{symbol}.
export interface ExecutionQuote {
  symbol: string;
  listing_status: ListingStatus;
  market_as_of: string | null;
  price_as_of: string | null;
  close: number | null;
  settlement_date: string | null;
}

export type QuoteResult =
  | { found: true; quote: ExecutionQuote }
  // An unknown symbol is a domain outcome, not a failure: §6.2 persists it as
  // a 201 rejected order with rejection_code SECURITY_NOT_FOUND, so it is
  // returned rather than thrown.
  | { found: false };

const LISTING_STATUSES: ReadonlyArray<ListingStatus> = [
  'listed',
  'suspended',
  'delisted',
];

function isExecutionQuote(value: unknown): value is ExecutionQuote {
  if (typeof value !== 'object' || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q.symbol === 'string' &&
    typeof q.listing_status === 'string' &&
    LISTING_STATUSES.includes(q.listing_status as ListingStatus) &&
    (q.market_as_of === null || typeof q.market_as_of === 'string') &&
    (q.price_as_of === null || typeof q.price_as_of === 'string') &&
    (q.close === null || typeof q.close === 'number') &&
    (q.settlement_date === null || typeof q.settlement_date === 'string')
  );
}

// The only route by which identity-auth obtains market data. Direct access to
// the market_data database is prohibited (SRS 3.6.2, paper-trading-v1.md §1),
// and only canonical symbols cross the boundary — never market-data uuids.
//
// Uses the global fetch rather than @nestjs/axios: one request needs no HTTP
// stack, and injecting this class lets callers mock a single interface instead
// of an HTTP layer.
@Injectable()
export class MarketTradingClient {
  private readonly logger = new Logger(MarketTradingClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .getOrThrow<string>('marketTrading.baseUrl')
      .replace(/\/+$/, '');
    this.timeoutMs = config.getOrThrow<number>('marketTrading.timeoutMs');
  }

  async getQuote(symbol: string): Promise<QuoteResult> {
    const url = `${this.baseUrl}/internal/paper-trading/quotes/${encodeURIComponent(symbol)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // Timeout, DNS failure, connection refused. Nothing is written and the
      // idempotency key stays reusable (§4).
      this.logger.error(
        `market-trading quote request failed: ${(error as Error).message}`,
      );
      throw new DependencyUnavailableException();
    }

    if (response.status === 404) {
      return { found: false };
    }

    if (!response.ok) {
      this.logger.error(
        `market-trading quote returned HTTP ${response.status}`,
      );
      throw new DependencyUnavailableException();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.logger.error('market-trading quote returned a non-JSON body');
      throw new DependencyUnavailableException();
    }

    const data = (body as { data?: unknown } | null)?.data;
    if (!isExecutionQuote(data)) {
      // A malformed payload is a broken dependency, not a domain rejection:
      // treating it as one would persist an order priced on garbage.
      this.logger.error('market-trading quote payload did not match §2.3');
      throw new DependencyUnavailableException();
    }

    return { found: true, quote: data };
  }
}

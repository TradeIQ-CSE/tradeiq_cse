import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorField,
  DependencyUnavailableException,
  ValidationFailedException,
} from '../common/errors/api-exception';

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

// docs/api/paper-trading-v1.md §2.4 — the closes behind the §7 views. One
// entry per requested symbol, all priced at the single session in `as_of`.
export interface ValuationPrice {
  symbol: string;
  close: number | null;
}

export interface Valuations {
  as_of: string | null;
  prices: ValuationPrice[];
}

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

function isValuations(value: unknown): value is Valuations {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.as_of !== null && typeof v.as_of !== 'string') return false;
  if (!Array.isArray(v.prices)) return false;
  return v.prices.every((price: unknown) => {
    if (typeof price !== 'object' || price === null) return false;
    const p = price as Record<string, unknown>;
    return (
      typeof p.symbol === 'string' &&
      (p.close === null || typeof p.close === 'number')
    );
  });
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
      // Only a genuine SECURITY_NOT_FOUND envelope counts as "symbol does not
      // exist". A bare 404 from a wrong base URL, a stray proxy or a renamed
      // route would otherwise be persisted as a rejected order telling the
      // user their symbol is unknown, hiding a configuration fault behind an
      // auditable but wrong result.
      if (await this.isSecurityNotFound(response)) {
        return { found: false };
      }
      this.logger.error(
        'market-trading returned 404 without a SECURITY_NOT_FOUND envelope',
      );
      throw new DependencyUnavailableException();
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

    // Guard against being handed another security's quote — a stale cache, a
    // misrouted proxy or a bug upstream. Pricing an order on the wrong stock
    // would move real cash and lots with nothing to flag it afterwards, so a
    // mismatch is a broken dependency rather than a tradable quote. Case may
    // differ: the caller sends what the user typed, the response is canonical.
    if (data.symbol.toUpperCase() !== symbol.toUpperCase()) {
      this.logger.error(
        `market-trading returned a quote for a different symbol than requested`,
      );
      throw new DependencyUnavailableException();
    }

    return { found: true, quote: data };
  }

  // docs/api/paper-trading-v1.md §2.4 — one call per portfolio view, so every
  // position in the response is priced at the same session. Looping getQuote
  // would resolve a session per symbol and answer a different question anyway
  // (the latest close at or before it, rather than on it).
  async getValuations(
    symbols: readonly string[],
    asOf?: string,
  ): Promise<Valuations> {
    const url = new URL(`${this.baseUrl}/internal/paper-trading/valuations`);
    if (symbols.length > 0) {
      url.searchParams.set('symbols', symbols.join(','));
    }
    if (asOf !== undefined) {
      url.searchParams.set('as_of', asOf);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `market-trading valuation request failed: ${(error as Error).message}`,
      );
      throw new DependencyUnavailableException();
    }

    // An out-of-range as_of is the user's input being wrong, not the dependency
    // failing, so it has to reach them as a 400 with the offending field rather
    // than as a 503 they would retry forever. getQuote has no equivalent case:
    // it takes no user-supplied date.
    //
    // Only as_of is forwarded, because it is the one field of this request the
    // user supplied. A complaint about `symbols` — §2.4 caps the list at 200,
    // which a portfolio holding more distinct securities would exceed — names a
    // parameter that does not exist on the §7 routes and that the user could
    // not correct, so it is our bug or the dependency's, not their input.
    if (response.status === 400) {
      const fields = await this.validationFields(response);
      if (fields?.length && fields.every((field) => field.field === 'as_of')) {
        throw new ValidationFailedException(fields);
      }
      this.logger.error(
        `market-trading rejected a valuation request over ${
          fields ? fields.map((field) => field.field).join(', ') : 'no field'
        }`,
      );
      throw new DependencyUnavailableException();
    }

    if (!response.ok) {
      this.logger.error(
        `market-trading valuations returned HTTP ${response.status}`,
      );
      throw new DependencyUnavailableException();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.logger.error('market-trading valuations returned a non-JSON body');
      throw new DependencyUnavailableException();
    }

    const data = (body as { data?: unknown } | null)?.data;
    if (!isValuations(data)) {
      this.logger.error('market-trading valuations payload did not match §2.4');
      throw new DependencyUnavailableException();
    }

    // Same reasoning as the symbol guard in getQuote: a response covering a
    // different set of symbols than was asked for means a stale cache or a
    // misrouted proxy, and valuing a portfolio on another security's closes
    // would be silent and wrong. Case may differ — the response is canonical.
    const returned = new Set(
      data.prices.map((price) => price.symbol.toUpperCase()),
    );
    const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    if (
      returned.size !== requested.size ||
      [...requested].some((symbol) => !returned.has(symbol))
    ) {
      this.logger.error(
        'market-trading valuations covered a different symbol set than requested',
      );
      throw new DependencyUnavailableException();
    }

    return data;
  }

  private async validationFields(
    response: Response,
  ): Promise<ApiErrorField[] | null> {
    try {
      const body = (await response.json()) as {
        error?: { code?: unknown; fields?: unknown };
      } | null;
      if (body?.error?.code !== 'VALIDATION_FAILED') return null;
      const fields = body.error.fields;
      return Array.isArray(fields) ? (fields as ApiErrorField[]) : [];
    } catch {
      return null;
    }
  }

  private async isSecurityNotFound(response: Response): Promise<boolean> {
    try {
      const body = (await response.json()) as {
        error?: { code?: unknown };
      } | null;
      return body?.error?.code === 'SECURITY_NOT_FOUND';
    } catch {
      return false;
    }
  }
}

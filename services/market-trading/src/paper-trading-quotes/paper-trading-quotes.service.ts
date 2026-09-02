import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security } from '../entities/security.entity';
import { SecurityNotFoundException } from '../common/errors/api-exception';
import { resolveMarketDate, toIsoDate } from '../common/market-date';
import { resolveSettlementDate } from '../common/settlement-date';

export type ListingStatus = 'listed' | 'suspended' | 'delisted';

export interface ExecutionQuote {
  symbol: string;
  listing_status: ListingStatus;
  market_as_of: string | null;
  price_as_of: string | null;
  close: number | null;
  settlement_date: string | null;
}

// docs/api/paper-trading-v1.md §2.4 — one close per requested symbol, all of
// them taken from the single session in `as_of`.
export interface ValuationPrice {
  symbol: string;
  close: number | null;
}

export interface Valuations {
  as_of: string | null;
  prices: ValuationPrice[];
}

// Raw row shape from the hand-written query below. numeric comes back as a
// string from the pg driver; `date` comes back as a JS Date.
interface RawQuoteRow {
  symbol: string;
  listing_event: string | null;
  price_as_of: Date | string | null;
  close: string | null;
}

interface RawValuationRow {
  symbol: string;
  close: string | null;
}

// market_data.listing_events is an event log, not a status column
// (event_type IN ('listed','suspended','resumed','delisted')). Derive the
// current status from the most recent event. A security with no events at all
// is treated as listed: nothing writes to this table yet, so every seeded
// security would otherwise have no status, and "listed" is the same answer a
// DEFAULT 'listed' column would have given.
function toListingStatus(event: string | null): ListingStatus {
  if (event === 'suspended') return 'suspended';
  if (event === 'delisted') return 'delisted';
  return 'listed';
}

@Injectable()
export class PaperTradingQuotesService {
  constructor(
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
  ) {}

  // docs/api/paper-trading-v1.md §2.3 — the execution quote identity-auth
  // prices paper orders from. Read-only, and carries no user data.
  //
  // This endpoint reports facts and makes no trading judgement: it returns the
  // listing status and whatever the latest price is, and identity-auth decides
  // whether that means SECURITY_NOT_TRADABLE, PRICE_UNAVAILABLE or STALE_PRICE
  // (§2.2). Keeping every rejection rule on one side of the boundary is what
  // stops the two services disagreeing about whether an order was tradable.
  async getQuote(symbol: string): Promise<ExecutionQuote> {
    const manager = this.securities.manager;

    // The session every order fills at: the latest completed market session.
    // Reused from the securities endpoints so a quote and a price table can
    // never disagree about which day "latest" means.
    const { asOf: marketAsOf } = await resolveMarketDate(manager);

    const rows: RawQuoteRow[] = await manager.query(
      `
      SELECT
        s.symbol,
        le.event_type AS listing_event,
        p.trade_date  AS price_as_of,
        p.close
      FROM market_data.securities s
      LEFT JOIN LATERAL (
        SELECT event_type
        FROM market_data.listing_events
        WHERE security_id = s.security_id
        ORDER BY event_date DESC, event_id DESC
        LIMIT 1
      ) le ON true
      LEFT JOIN LATERAL (
        SELECT trade_date, close
        FROM market_data.daily_prices
        WHERE security_id = s.security_id
          AND trade_date <= $2::date
        ORDER BY trade_date DESC
        LIMIT 1
      ) p ON true
      WHERE upper(s.symbol) = upper($1)
      `,
      [symbol, marketAsOf],
    );

    if (rows.length === 0) {
      throw new SecurityNotFoundException();
    }

    const row = rows[0];
    const priceAsOf = toIsoDate(row.price_as_of);

    // §2.3: a known security with no usable price is a 200 with nulls, not an
    // error — that is what lets identity-auth persist an auditable
    // PRICE_UNAVAILABLE rejection instead of treating it as a dependency
    // failure. A zero close is passed through as-is rather than nulled here,
    // because "missing or zero" is identity-auth's rejection rule (§2.2).
    const settlementDate =
      priceAsOf !== null && marketAsOf !== null
        ? await resolveSettlementDate(manager, marketAsOf)
        : null;

    return {
      // Echo the canonical stored symbol, not what the caller sent: the SPA
      // may send "comb.n0000" and the boundary contract says canonical symbols
      // are what cross it.
      symbol: row.symbol,
      listing_status: toListingStatus(row.listing_event),
      market_as_of: marketAsOf,
      price_as_of: priceAsOf,
      close: row.close !== null ? Number(row.close) : null,
      settlement_date: settlementDate,
    };
  }

  // docs/api/paper-trading-v1.md §2.4 — the closes behind the §7 position and
  // summary views.
  //
  // Deliberately not getQuote in a loop. That one answers "the latest close at
  // or before this session", which is what an order fills at; this one answers
  // "the close ON this session", because §3.4 forbids a valuation response from
  // mixing dates across positions. A thinly traded symbol is exactly where the
  // two answers differ, and silently carrying its previous close forward is the
  // failure §3.4 names. Resolving the session once here is also what makes the
  // single-session rule structural rather than something the caller has to
  // maintain across several requests.
  async getValuations(
    symbols: readonly string[],
    asOf?: string,
  ): Promise<Valuations> {
    const manager = this.securities.manager;

    // Resolved before the early return below so an out-of-range as_of is still
    // a 400, and the caller still learns the session, when nothing is held.
    const { asOf: effectiveAsOf } = await resolveMarketDate(manager, asOf);

    // Case-insensitive, because the caller may send whatever the user typed.
    // Deduplicated so a repeated symbol cannot produce two entries for one
    // position; the response is keyed by symbol.
    const requested = [...new Map(symbols.map((s) => [s.toUpperCase(), s]))];

    if (requested.length === 0 || effectiveAsOf === null) {
      // No session means no price data at all (§2.4), so every close is null
      // and there is nothing to look up.
      return {
        as_of: effectiveAsOf,
        prices: requested
          .map(([, original]) => ({ symbol: original, close: null }))
          .sort(bySymbol),
      };
    }

    const rows: RawValuationRow[] = await manager.query(
      `
      SELECT s.symbol, p.close
      FROM market_data.securities s
      LEFT JOIN market_data.daily_prices p
        ON p.security_id = s.security_id
       AND p.trade_date = $2::date
      WHERE upper(s.symbol) = ANY($1::text[])
      `,
      [requested.map(([upper]) => upper), effectiveAsOf],
    );

    const found = new Map(
      rows.map((row) => [row.symbol.toUpperCase(), row] as const),
    );

    return {
      as_of: effectiveAsOf,
      prices: requested
        .map(([upper, original]) => {
          const row = found.get(upper);
          return {
            // Canonical stored symbol where the security is known, as in §2.3.
            // An unknown symbol has no canonical form, so echo what was asked
            // for — the caller still needs one entry per symbol it sent.
            symbol: row?.symbol ?? original,
            close: row?.close != null ? Number(row.close) : null,
          };
        })
        .sort(bySymbol),
    };
  }
}

function bySymbol(a: ValuationPrice, b: ValuationPrice): number {
  return a.symbol.localeCompare(b.symbol);
}

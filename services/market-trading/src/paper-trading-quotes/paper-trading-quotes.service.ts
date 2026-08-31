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

// Raw row shape from the hand-written query below. numeric comes back as a
// string from the pg driver; `date` comes back as a JS Date.
interface RawQuoteRow {
  symbol: string;
  listing_event: string | null;
  price_as_of: Date | string | null;
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
}

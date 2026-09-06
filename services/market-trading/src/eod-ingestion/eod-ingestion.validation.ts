import { createHash } from 'crypto';
import { ApiErrorField } from '../common/errors/api-exception';
import {
  EodIngestionRequest,
  EodPriceInput,
  EodSecurityInput,
} from './eod-ingestion.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SYMBOL = /^[A-Z0-9]{1,10}\.[A-Z][0-9]{4}$/;
const PRICE = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/;
const INTEGER = /^(?:0|[1-9]\d*)$/;
const MAX_BIGINT = BigInt('9223372036854775807');

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function stringValue(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fields: ApiErrorField[],
  max: number,
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fields.push({
      field: `${path}.${key}`,
      reason: `must be a non-empty string up to ${max} characters`,
    });
    return '';
  }
  return value;
}

function hashValue(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fields: ApiErrorField[],
): string {
  const value = source[key];
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fields.push({
      field: path ? `${path}.${key}` : key,
      reason: 'must be a lowercase SHA-256 hex digest',
    });
    return '';
  }
  return value;
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  fields: ApiErrorField[],
  max: number,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) {
    fields.push({
      field: `${path}.${key}`,
      reason: `must be a string up to ${max} characters`,
    });
    return undefined;
  }
  return value;
}

function parseSecurity(
  value: unknown,
  index: number,
  fields: ApiErrorField[],
): EodSecurityInput | null {
  const item = record(value);
  const path = `securities[${index}]`;
  if (!item) {
    fields.push({ field: path, reason: 'must be an object' });
    return null;
  }
  const symbol = stringValue(item, 'symbol', path, fields, 20);
  if (symbol && !SYMBOL.test(symbol)) {
    fields.push({
      field: `${path}.symbol`,
      reason: 'must be a canonical uppercase CSE symbol',
    });
  }
  const companyName = stringValue(item, 'company_name', path, fields, 200);
  const cseCode = optionalString(item, 'cse_code', path, fields, 30);
  const shares = optionalString(item, 'shares_outstanding', path, fields, 20);
  if (shares && (!INTEGER.test(shares) || BigInt(shares) > MAX_BIGINT)) {
    fields.push({
      field: `${path}.shares_outstanding`,
      reason: 'must be a non-negative PostgreSQL bigint string',
    });
  }
  return {
    symbol,
    company_name: companyName,
    ...(cseCode ? { cse_code: cseCode } : {}),
    ...(shares ? { shares_outstanding: shares } : {}),
  };
}

function decimalToScaled(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, '0'));
}

function parsePrice(
  value: unknown,
  index: number,
  tradeDate: string,
  fields: ApiErrorField[],
): EodPriceInput | null {
  const item = record(value);
  const path = `prices[${index}]`;
  if (!item) {
    fields.push({ field: path, reason: 'must be an object' });
    return null;
  }
  const symbol = stringValue(item, 'symbol', path, fields, 20);
  if (symbol && !SYMBOL.test(symbol)) {
    fields.push({
      field: `${path}.symbol`,
      reason: 'must be a canonical uppercase CSE symbol',
    });
  }
  const values: Record<string, string | null> = {};
  for (const key of ['open', 'high', 'low', 'close'] as const) {
    const raw = item[key];
    if (key === 'open' && raw === null) {
      values[key] = null;
    } else if (typeof raw !== 'string' || !PRICE.test(raw)) {
      fields.push({
        field: `${path}.${key}`,
        reason:
          'must be a non-negative decimal string with at most four decimal places',
      });
      values[key] = '0';
    } else {
      values[key] = raw;
    }
  }
  const volume = item.volume;
  if (
    typeof volume !== 'string' ||
    !INTEGER.test(volume) ||
    BigInt(volume) > MAX_BIGINT
  ) {
    fields.push({
      field: `${path}.volume`,
      reason: 'must be a non-negative PostgreSQL bigint string',
    });
  }
  const warnings = item.validation_warnings;
  if (
    !Array.isArray(warnings) ||
    warnings.some((warning) => typeof warning !== 'string')
  ) {
    fields.push({
      field: `${path}.validation_warnings`,
      reason: 'must be an array of strings',
    });
  }
  if (typeof item.ohlc_repaired !== 'boolean') {
    fields.push({
      field: `${path}.ohlc_repaired`,
      reason: 'must be a boolean',
    });
  }
  if (
    PRICE.test(values.high ?? '') &&
    PRICE.test(values.low ?? '') &&
    PRICE.test(values.close ?? '')
  ) {
    const high = decimalToScaled(values.high as string);
    const low = decimalToScaled(values.low as string);
    const close = decimalToScaled(values.close as string);
    const open =
      values.open === null ? null : decimalToScaled(values.open as string);
    if (
      high < low ||
      close > high ||
      close < low ||
      (open !== null && (open > high || open < low))
    ) {
      fields.push({
        field: path,
        reason: `contains inconsistent OHLC bounds for ${tradeDate}`,
      });
    }
  }
  return {
    symbol,
    open: values.open,
    high: values.high as string,
    low: values.low as string,
    close: values.close as string,
    volume: typeof volume === 'string' ? volume : '',
    validation_warnings: Array.isArray(warnings)
      ? warnings.filter((v): v is string => typeof v === 'string')
      : [],
    ohlc_repaired: item.ohlc_repaired === true,
  };
}

export function calculateMarketDigest(
  tradeDate: string,
  prices: readonly EodPriceInput[],
): string {
  const canonical = [...prices]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((price) => ({
      date: tradeDate,
      symbol: price.symbol,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,
    }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function parseEodIngestionRequest(value: unknown): {
  request: EodIngestionRequest | null;
  fields: ApiErrorField[];
} {
  const fields: ApiErrorField[] = [];
  const body = record(value);
  if (!body)
    return {
      request: null,
      fields: [{ field: 'body', reason: 'must be an object' }],
    };

  if (body.contract_version !== '1')
    fields.push({ field: 'contract_version', reason: 'must equal 1' });
  const batchId = hashValue(body, 'batch_id', '', fields);
  const tradeDate = body.trade_date;
  if (!validDate(tradeDate))
    fields.push({
      field: 'trade_date',
      reason: 'must be a real ISO calendar date',
    });

  const source = record(body.source);
  const calendar = record(body.calendar);
  const validation = record(body.validation);
  if (!source) fields.push({ field: 'source', reason: 'must be an object' });
  if (!calendar)
    fields.push({ field: 'calendar', reason: 'must be an object' });
  if (!validation)
    fields.push({ field: 'validation', reason: 'must be an object' });

  const securitiesRaw = body.securities;
  const pricesRaw = body.prices;
  if (
    !Array.isArray(securitiesRaw) ||
    securitiesRaw.length === 0 ||
    securitiesRaw.length > 2000
  ) {
    fields.push({
      field: 'securities',
      reason: 'must contain between 1 and 2000 records',
    });
  }
  if (
    !Array.isArray(pricesRaw) ||
    pricesRaw.length === 0 ||
    pricesRaw.length > 2000
  ) {
    fields.push({
      field: 'prices',
      reason: 'must contain between 1 and 2000 records',
    });
  }
  const securities = Array.isArray(securitiesRaw)
    ? securitiesRaw
        .map((item, index) => parseSecurity(item, index, fields))
        .filter((item): item is EodSecurityInput => item !== null)
    : [];
  const prices = Array.isArray(pricesRaw)
    ? pricesRaw
        .map((item, index) =>
          parsePrice(
            item,
            index,
            typeof tradeDate === 'string' ? tradeDate : '',
            fields,
          ),
        )
        .filter((item): item is EodPriceInput => item !== null)
    : [];

  const securitySymbols = securities.map((item) => item.symbol);
  const priceSymbols = prices.map((item) => item.symbol);
  if (new Set(securitySymbols).size !== securitySymbols.length)
    fields.push({ field: 'securities', reason: 'contains duplicate symbols' });
  if (new Set(priceSymbols).size !== priceSymbols.length)
    fields.push({ field: 'prices', reason: 'contains duplicate symbols' });
  const metadataSet = new Set(securitySymbols);
  const priceSet = new Set(priceSymbols);
  if (priceSymbols.some((symbol) => !metadataSet.has(symbol)))
    fields.push({
      field: 'securities',
      reason: 'must include metadata for every price symbol',
    });
  if (securitySymbols.some((symbol) => !priceSet.has(symbol)))
    fields.push({
      field: 'securities',
      reason: 'must not include securities without a price in this batch',
    });

  const processed = validation?.processed;
  const accepted = validation?.accepted;
  const rejected = validation?.rejected;
  const repaired = validation?.repaired;
  for (const [key, count] of Object.entries({
    processed,
    accepted,
    rejected,
    repaired,
  })) {
    if (!Number.isInteger(count) || (count as number) < 0)
      fields.push({
        field: `validation.${key}`,
        reason: 'must be a non-negative integer',
      });
  }
  if (
    accepted !== prices.length ||
    processed !== prices.length ||
    rejected !== 0
  ) {
    fields.push({
      field: 'validation',
      reason: 'must describe a fully accepted, non-empty price batch',
    });
  }

  if (calendar?.is_trading_day !== true)
    fields.push({ field: 'calendar.is_trading_day', reason: 'must be true' });
  const calendarSource = calendar
    ? stringValue(calendar, 'source', 'calendar', fields, 200)
    : '';
  const calendarVerified = calendar?.verified_at;
  if (
    typeof calendarVerified !== 'string' ||
    Number.isNaN(Date.parse(calendarVerified))
  )
    fields.push({
      field: 'calendar.verified_at',
      reason: 'must be an RFC 3339 timestamp',
    });

  const sourceName = source
    ? stringValue(source, 'name', 'source', fields, 100)
    : '';
  const capturedAt = source?.captured_at;
  if (typeof capturedAt !== 'string' || Number.isNaN(Date.parse(capturedAt)))
    fields.push({
      field: 'source.captured_at',
      reason: 'must be an RFC 3339 timestamp',
    });
  const sourceDateMethod = source
    ? stringValue(source, 'source_date_method', 'source', fields, 100)
    : '';
  const rawPayloadHash = source
    ? hashValue(source, 'raw_payload_hash', 'source', fields)
    : '';
  const marketDigest = hashValue(body, 'market_digest', '', fields);
  if (
    validDate(tradeDate) &&
    prices.length > 0 &&
    calculateMarketDigest(tradeDate, prices) !== marketDigest
  ) {
    fields.push({
      field: 'market_digest',
      reason: 'does not match the canonical price rows',
    });
  }

  const producerCommit = source
    ? optionalString(source, 'producer_commit', 'source', fields, 40)
    : undefined;
  const actionRunUrl = source
    ? optionalString(source, 'action_run_url', 'source', fields, 1000)
    : undefined;

  if (
    fields.length > 0 ||
    !source ||
    !calendar ||
    !validation ||
    !validDate(tradeDate)
  ) {
    return { request: null, fields };
  }
  return {
    request: {
      contract_version: '1',
      batch_id: batchId,
      trade_date: tradeDate,
      source: {
        name: sourceName,
        captured_at: capturedAt as string,
        source_date_method: sourceDateMethod,
        raw_payload_hash: rawPayloadHash,
        ...(producerCommit ? { producer_commit: producerCommit } : {}),
        ...(actionRunUrl ? { action_run_url: actionRunUrl } : {}),
      },
      calendar: {
        is_trading_day: true,
        source: calendarSource,
        verified_at: calendarVerified as string,
      },
      validation: {
        processed: processed as number,
        accepted: accepted as number,
        rejected: rejected as number,
        repaired: repaired as number,
      },
      securities,
      prices,
      market_digest: marketDigest,
    },
    fields,
  };
}

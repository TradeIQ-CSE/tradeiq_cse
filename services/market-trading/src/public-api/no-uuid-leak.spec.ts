import { RawEodRow, toEodRow } from './public-eod.service';
import {
  RawPublicSecurityRow,
  toPublicSecurity,
} from './public-securities.service';

// docs/api/public-api-v1.md §5 — no internal identifier (security_id,
// api_key_id, or any uuid) may ever appear in a public response. The mappers
// build a fresh literal object rather than spreading their raw row, so this
// is mostly a regression guard: it fails loudly if a future edit ever does
// `return { ...row }` and reintroduces a leak.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEYS = [
  'security_id',
  'api_key_id',
  'index_value_id',
  'sector_id',
];

function assertNoLeak(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (UUID_RE.test(value)) {
      throw new Error(`found a uuid-like string at ${path}: ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoLeak(item, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      expect(FORBIDDEN_KEYS).not.toContain(key);
      assertNoLeak(v, `${path}.${key}`);
    }
  }
}

describe('public API mappers never emit an internal id', () => {
  it('toPublicSecurity drops every id, even one hiding in the raw row', () => {
    const row: RawPublicSecurityRow & {
      security_id?: string;
      sector_id?: string;
    } = {
      symbol: 'JKH.N0000',
      company_name: 'John Keells Holdings PLC',
      cse_code: 'JKH.N0000',
      gics_code: '2010',
      sector_name: 'Capital Goods',
      shares_outstanding: '1513637385',
      data_from: '2017-01-02',
      data_to: '2025-12-31',
      event_type: 'listed',
      security_id: 'a1a1a1a1-1111-4111-8111-111111111111',
      sector_id: 'b2b2b2b2-2222-4222-8222-222222222222',
    };
    assertNoLeak(toPublicSecurity(row));
  });

  it('toPublicSecurity with a null sector/cse_code/shares_outstanding', () => {
    const row: RawPublicSecurityRow = {
      symbol: 'NOSECTOR.N0000',
      company_name: 'No Sector PLC',
      cse_code: null,
      gics_code: null,
      sector_name: null,
      shares_outstanding: null,
      data_from: null,
      data_to: null,
      event_type: null,
    };
    const mapped = toPublicSecurity(row);
    assertNoLeak(mapped);
    expect(mapped.sector).toBeNull();
    expect(mapped.listing_status).toBe('listed');
  });

  it('toEodRow drops every id, even one hiding in the raw row', () => {
    const row: RawEodRow & { security_id?: string } = {
      symbol: 'JKH.N0000',
      open: '22.10',
      high: '22.59',
      low: '22.13',
      close: '22.43',
      volume: '1631334',
      prev_close: '22.25',
      security_id: 'c3c3c3c3-3333-4333-8333-333333333333',
    };
    assertNoLeak(toEodRow(row, '2025-01-02'));
  });

  it('a plausible public indices/eod response shape carries no id anywhere', () => {
    assertNoLeak({
      data: [
        {
          code: 'SL20',
          name: 'S&P Sri Lanka 20',
          latest: {
            date: '2025-01-10',
            close: 4734.44,
            change: -27.87,
            change_pct: -0.59,
          },
        },
      ],
      meta: { page: 1, page_size: 50, total: 1 },
    });
  });
});

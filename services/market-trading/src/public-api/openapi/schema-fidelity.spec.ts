import { generateReferenceDocument } from './reference-document';
import { responseValidator } from '../../../test/schema-validation';
import { WORKED_EXAMPLES, QUOTA_EXAMPLES } from './worked-examples';

interface FixtureResponse {
  data: Record<string, unknown> | Record<string, unknown>[];
  meta?: {
    page: number;
    page_size: number;
    total: number;
    as_of?: string | null;
  };
}
describe('Published public response schema and example fidelity', () => {
  let document: Awaited<ReturnType<typeof JSON.parse>>;
  beforeAll(async () => {
    document = JSON.parse(await generateReferenceDocument());
  });
  it('permits nullable object usages while preserving required present-object fields', () => {
    const validateSecurity = responseValidator(document, {
      $ref: '#/components/schemas/PublicSecuritySchema',
    });
    const security = (
      WORKED_EXAMPLES['/public/v1/securities/{symbol}'].primary
        .value as FixtureResponse
    ).data;
    expect(validateSecurity({ ...security, sector: null })).toBe(true);
    expect(
      validateSecurity({
        ...security,
        sector: { gics_code: '4010', name: 'Banks' },
      }),
    ).toBe(true);
    expect(validateSecurity({ ...security, sector: {} })).toBe(false);
    const validateIndex = responseValidator(document, {
      $ref: '#/components/schemas/PublicIndexSchema',
    });
    expect(
      validateIndex({
        code: 'ASPI',
        name: 'All Share Price Index',
        latest: null,
      }),
    ).toBe(true);
    expect(
      validateIndex({
        code: 'SL20',
        name: 'S&P Sri Lanka 20',
        latest: {
          date: '2025-01-03',
          close: 4740.06,
          change: 8,
          change_pct: 0.17,
        },
      }),
    ).toBe(true);
    expect(
      validateIndex({
        code: 'SL20',
        name: 'S&P Sri Lanka 20',
        latest: { date: '2025-01-03' },
      }),
    ).toBe(false);
  });
  it('accepts both external429 sources and retains the per-key reset requirement', () => {
    for (const path of Object.keys(WORKED_EXAMPLES)) {
      const schema =
        document.paths[path].get.responses['429'].content['application/json']
          .schema;
      const validate = responseValidator(document, schema);
      expect(validate(QUOTA_EXAMPLES.edge.value)).toBe(true);
      expect(validate(QUOTA_EXAMPLES.perKey.value)).toBe(true);
      expect(
        validate({ error: { code: 'RATE_LIMITED', message: 'missing trace' } }),
      ).toBe(false);
    }
    const keyOnly = responseValidator(document, {
      $ref: '#/components/schemas/RateLimitedErrorSchema',
    });
    expect(keyOnly(QUOTA_EXAMPLES.perKey.value)).toBe(true);
    expect(keyOnly(QUOTA_EXAMPLES.edge.value)).toBe(false);
  });
  it('validates every published worked response and its pagination/range relationships', () => {
    let checked = 0;
    for (const [path, cases] of Object.entries(WORKED_EXAMPLES)) {
      const media =
        document.paths[path].get.responses['200'].content['application/json'];
      const validate = responseValidator(document, media.schema);
      for (const [key, example] of Object.entries(cases)) {
        expect(media.examples[key]).toEqual(example);
        expect(validate(example.value)).toBe(true);
        const request = new URL(example['x-request'], 'https://example.test');
        const response = example.value as FixtureResponse;
        if (response.meta) {
          const meta = response.meta;
          expect(meta.page_size).toBe(
            Number(request.searchParams.get('page_size')),
          );
          expect(meta.page).toBe(Number(request.searchParams.get('page')));
          const values = Array.isArray(response.data)
            ? response.data
            : ((response.data.bars ?? response.data.values) as Record<
                string,
                unknown
              >[]);
          expect(values.length).toBe(
            Math.max(
              0,
              Math.min(
                meta.page_size,
                meta.total - (meta.page - 1) * meta.page_size,
              ),
            ),
          );
          for (const value of values) {
            if (
              typeof value.date === 'string' &&
              request.searchParams.has('from')
            ) {
              expect(value.date >= request.searchParams.get('from')!).toBe(
                true,
              );
              expect(value.date <= request.searchParams.get('to')!).toBe(true);
            }
          }
        }
        checked++;
      }
    }
    expect(checked).toBe(13);
  });
});

import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger';
import { PublicListSecuritiesQueryDto } from '../dto/public-list-securities-query.dto';
import { PublicOhlcvQueryDto } from '../dto/public-ohlcv-query.dto';
import { PublicListIndicesQueryDto } from '../dto/public-list-indices-query.dto';
import { PublicIndexValuesQueryDto } from '../dto/public-index-values-query.dto';
import { PublicEodQueryDto } from '../dto/public-eod-query.dto';

// docs/adr/0010-public-developer-api.md "Tests" — every documented query parameter's
// bounds (@ApiPropertyOptional on the DTO) must match what the DTO's own
// class-validator decorators actually enforce (pagination-bounds.spec.ts),
// so the hosted docs can never quietly drift from the real validation rule.
interface DocumentedNumberProperty {
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

function documented(
  Dto: new () => object,
  property: string,
): DocumentedNumberProperty | undefined {
  return Reflect.getMetadata(
    DECORATORS.API_MODEL_PROPERTIES,
    Dto.prototype,
    property,
  ) as DocumentedNumberProperty | undefined;
}

const CASES: {
  name: string;
  Dto: new () => object;
  defaultPageSize: number;
  maxPageSize: number;
}[] = [
  {
    name: 'PublicListSecuritiesQueryDto',
    Dto: PublicListSecuritiesQueryDto,
    defaultPageSize: 50,
    maxPageSize: 200,
  },
  {
    name: 'PublicOhlcvQueryDto',
    Dto: PublicOhlcvQueryDto,
    defaultPageSize: 500,
    maxPageSize: 1000,
  },
  {
    name: 'PublicListIndicesQueryDto',
    Dto: PublicListIndicesQueryDto,
    defaultPageSize: 50,
    maxPageSize: 200,
  },
  {
    name: 'PublicIndexValuesQueryDto',
    Dto: PublicIndexValuesQueryDto,
    defaultPageSize: 500,
    maxPageSize: 1000,
  },
  {
    name: 'PublicEodQueryDto',
    Dto: PublicEodQueryDto,
    defaultPageSize: 200,
    maxPageSize: 500,
  },
];

describe.each(CASES)(
  '$name documented bounds',
  ({ Dto, defaultPageSize, maxPageSize }) => {
    it('page_size: documented minimum, maximum and default match the validators', () => {
      const meta = documented(Dto, 'page_size');
      expect(meta?.minimum).toBe(1);
      expect(meta?.maximum).toBe(maxPageSize);
      expect(meta?.default).toBe(defaultPageSize);
    });

    it('page: documented minimum and default match the validators', () => {
      const meta = documented(Dto, 'page');
      expect(meta?.minimum).toBe(1);
      expect(meta?.default).toBe(1);
    });
  },
);

describe('PublicOhlcvQueryDto documented timeframe', () => {
  it('documents the same three values IsIn validates', () => {
    const meta = documented(PublicOhlcvQueryDto, 'timeframe') as {
      enum?: string[];
      default?: unknown;
    };
    expect(meta?.enum).toEqual(['daily', 'weekly', 'monthly']);
    expect(meta?.default).toBe('daily');
  });
});

describe('PublicListSecuritiesQueryDto documented search', () => {
  it('documents the same 1–100 character bounds MinLength/MaxLength validate', () => {
    const meta = documented(PublicListSecuritiesQueryDto, 'search') as {
      minLength?: number;
      maxLength?: number;
    };
    expect(meta?.minLength).toBe(1);
    expect(meta?.maxLength).toBe(100);
  });

  it('documents the same 10-character max MaxLength validates for sector', () => {
    const meta = documented(PublicListSecuritiesQueryDto, 'sector') as {
      maxLength?: number;
    };
    expect(meta?.maxLength).toBe(10);
  });
});

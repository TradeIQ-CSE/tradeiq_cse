import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PublicEodQueryDto } from './public-eod-query.dto';
import { PublicIndexValuesQueryDto } from './public-index-values-query.dto';
import { PublicListIndicesQueryDto } from './public-list-indices-query.dto';
import { PublicListSecuritiesQueryDto } from './public-list-securities-query.dto';
import { PublicOhlcvQueryDto } from './public-ohlcv-query.dto';

// docs/api/public-api-v1.md §6 — each resource's own page_size bounds and
// default. One table-driven spec so a bound is verified in exactly one place.
const CASES: {
  name: string;
  Dto: new () => { page: number; page_size: number };
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
  '$name pagination bounds',
  ({ Dto, defaultPageSize, maxPageSize }) => {
    it('defaults page to 1 and page_size to the resource default', () => {
      const dto = plainToInstance(Dto, {});
      expect(validateSync(dto)).toEqual([]);
      expect(dto.page).toBe(1);
      expect(dto.page_size).toBe(defaultPageSize);
    });

    it('accepts page_size at exactly 1 and at exactly the max', () => {
      expect(validateSync(plainToInstance(Dto, { page_size: 1 }))).toEqual([]);
      expect(
        validateSync(plainToInstance(Dto, { page_size: maxPageSize })),
      ).toEqual([]);
    });

    it('rejects page_size 0', () => {
      const errors = validateSync(plainToInstance(Dto, { page_size: 0 }));
      expect(errors.map((e) => e.property)).toContain('page_size');
    });

    it('rejects page_size one above the max', () => {
      const errors = validateSync(
        plainToInstance(Dto, { page_size: maxPageSize + 1 }),
      );
      expect(errors.map((e) => e.property)).toContain('page_size');
    });

    it('rejects page below 1', () => {
      const errors = validateSync(plainToInstance(Dto, { page: 0 }));
      expect(errors.map((e) => e.property)).toContain('page');
    });

    it('accepts a page number above 1', () => {
      expect(validateSync(plainToInstance(Dto, { page: 7 }))).toEqual([]);
    });

    it('rejects a non-integer page_size', () => {
      const errors = validateSync(plainToInstance(Dto, { page_size: 1.5 }));
      expect(errors.map((e) => e.property)).toContain('page_size');
    });
  },
);

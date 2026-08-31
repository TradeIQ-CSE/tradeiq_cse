import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MarketOverviewQueryDto } from './market-overview-query.dto';

describe('MarketOverviewQueryDto', () => {
  it('transforms a valid limit and accepts documented filters', () => {
    const dto = plainToInstance(MarketOverviewQueryDto, {
      as_of: '2025-01-10',
      sector: '4010',
      market_cap: 'large',
      limit: '50',
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.limit).toBe(50);
  });

  it.each([
    [{ as_of: '2025/01/10' }, 'as_of'],
    [{ as_of: '2025-02-31' }, 'as_of'],
    [{ market_cap: 'mega' }, 'market_cap'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '51' }, 'limit'],
  ])('rejects invalid query input %p', (input, field) => {
    const dto = plainToInstance(MarketOverviewQueryDto, input);
    const errors = validateSync(dto);

    expect(errors.map(({ property }) => property)).toContain(field);
  });
});

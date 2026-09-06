import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OhlcvQueryDto } from './ohlcv-query.dto';

describe('OhlcvQueryDto', () => {
  it('defaults to daily and accepts an omitted date range', () => {
    const dto = plainToInstance(OhlcvQueryDto, {});

    expect(validateSync(dto)).toEqual([]);
    expect(dto.timeframe).toBe('daily');
    expect(dto.from).toBeUndefined();
    expect(dto.to).toBeUndefined();
  });

  it.each(['daily', 'weekly', 'monthly'])(
    'accepts the %s timeframe',
    (timeframe) => {
      const dto = plainToInstance(OhlcvQueryDto, {
        timeframe,
        from: '2025-01-01',
        to: '2025-01-31',
      });

      expect(validateSync(dto)).toEqual([]);
    },
  );

  it.each([
    [{ timeframe: 'hourly' }, 'timeframe'],
    [{ from: '2025/01/01' }, 'from'],
    [{ from: '2025-02-30' }, 'from'],
    [{ to: '01-31-2025' }, 'to'],
  ])('rejects invalid query input %p', (input, field) => {
    const dto = plainToInstance(OhlcvQueryDto, input);
    const errors = validateSync(dto);

    expect(errors.map(({ property }) => property)).toContain(field);
  });
});

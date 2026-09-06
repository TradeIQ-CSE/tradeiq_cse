import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security } from '../entities/security.entity';
import { Sector } from '../entities/sector.entity';
import { ValidationFailedException } from '../common/errors/api-exception';
import { SecuritiesService } from './securities.service';

describe('SecuritiesService', () => {
  let service: SecuritiesService;
  let sectorsFindOne: jest.Mock;
  let managerQuery: jest.Mock;

  beforeEach(async () => {
    managerQuery = jest.fn();
    sectorsFindOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecuritiesService,
        {
          provide: getRepositoryToken(Security),
          useValue: { manager: { query: managerQuery } },
        },
        {
          provide: getRepositoryToken(Sector),
          useValue: { findOne: sectorsFindOne },
        },
      ],
    }).compile();

    service = module.get(SecuritiesService);
  });

  const mockDateRange = () =>
    managerQuery.mockResolvedValueOnce([
      { from: '2017-01-02', to: '2025-12-31' },
    ]);

  it('rejects an unknown sector code', async () => {
    sectorsFindOne.mockResolvedValue(null);

    await expect(
      service.list({ sector: 'nope', sort: 'symbol', page: 1, page_size: 50 }),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(managerQuery).not.toHaveBeenCalled();
  });

  it('maps rows into the contract response shape, computing change from prev_close', async () => {
    mockDateRange();
    managerQuery.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
      {
        symbol: 'JKH.N0000',
        company_name: 'John Keells Holdings PLC',
        gics_code: '2010',
        sector_name: 'Capital Goods',
        shares_outstanding: '1513637385',
        data_from: '2017-01-02',
        data_to: '2025-12-31',
        price: '22.4300',
        volume: '1631334',
        prev_close: '22.2500',
        pe_ratio: '12.3400',
      },
    ]);

    const result = await service.list({
      sort: 'symbol',
      page: 1,
      page_size: 50,
    });

    expect(result).toEqual({
      data: [
        {
          symbol: 'JKH.N0000',
          company_name: 'John Keells Holdings PLC',
          sector: { gics_code: '2010', name: 'Capital Goods' },
          shares_outstanding: 1513637385,
          data_from: '2017-01-02',
          data_to: '2025-12-31',
          price: 22.43,
          change: 0.18,
          change_pct: 0.81,
          volume: 1631334,
          pe_ratio: 12.34,
        },
      ],
      meta: {
        page: 1,
        page_size: 50,
        total: 1,
        as_of: '2025-12-31',
        available_from: '2017-01-02',
        available_to: '2025-12-31',
      },
    });
  });

  it('formats pg Date columns as YYYY-MM-DD, not RFC 3339 timestamps', async () => {
    managerQuery
      .mockResolvedValueOnce([
        { from: new Date(2017, 0, 2), to: new Date(2025, 11, 31) },
      ])
      .mockResolvedValueOnce([{ total: '1' }])
      .mockResolvedValueOnce([
        {
          symbol: 'JKH.N0000',
          company_name: 'John Keells Holdings PLC',
          gics_code: null,
          sector_name: null,
          shares_outstanding: null,
          // node-postgres hands back Date objects for `date` columns.
          data_from: new Date(2025, 0, 2),
          data_to: new Date(2025, 11, 31),
          price: null,
          volume: null,
          prev_close: null,
          pe_ratio: null,
        },
      ]);

    const result = await service.list({
      sort: 'symbol',
      page: 1,
      page_size: 50,
    });

    expect(result.data[0].data_from).toBe('2025-01-02');
    expect(result.data[0].data_to).toBe('2025-12-31');
  });

  it('leaves price fields null when a security has no price history', async () => {
    mockDateRange();
    managerQuery.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
      {
        symbol: 'NEW.N0000',
        company_name: 'Newly Listed PLC',
        gics_code: null,
        sector_name: null,
        shares_outstanding: null,
        data_from: null,
        data_to: null,
        price: null,
        volume: null,
        prev_close: null,
        pe_ratio: null,
      },
    ]);

    const result = await service.list({
      sort: 'symbol',
      page: 1,
      page_size: 50,
    });

    expect(result.data[0]).toEqual({
      symbol: 'NEW.N0000',
      company_name: 'Newly Listed PLC',
      sector: null,
      shares_outstanding: null,
      data_from: null,
      data_to: null,
      price: null,
      change: null,
      change_pct: null,
      volume: null,
      pe_ratio: null,
    });
  });

  it('settles a non-trading date to the previous session', async () => {
    mockDateRange();
    managerQuery
      .mockResolvedValueOnce([{ trade_date: '2025-08-15' }])
      .mockResolvedValueOnce([{ total: '0' }])
      .mockResolvedValueOnce([]);

    const result = await service.list({
      as_of: '2025-08-17',
      sort: 'symbol',
      page: 1,
      page_size: 50,
    });

    expect(managerQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE trade_date <= $1::date'),
      ['2025-08-17'],
    );
    expect(result.meta.as_of).toBe('2025-08-15');
  });

  it('rejects a date outside the available price range', async () => {
    mockDateRange();

    await expect(
      service.list({
        as_of: '2016-12-31',
        sort: 'symbol',
        page: 1,
        page_size: 50,
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(managerQuery).toHaveBeenCalledTimes(1);
  });

  describe('detail', () => {
    const detailRow = (overrides: Record<string, unknown> = {}) => ({
      symbol: 'JKH.N0000',
      company_name: 'John Keells Holdings PLC',
      cse_code: 'JKH.N0000',
      gics_code: '2010',
      sector_name: 'Capital Goods',
      shares_outstanding: '1513637385',
      data_from: new Date(2017, 0, 2),
      data_to: '2025-12-31',
      event_type: 'suspended',
      trade_date: new Date(2025, 11, 31),
      close: '22.4300',
      volume: '1631334',
      prev_close: '22.2500',
      valid_from: new Date(2025, 9, 1),
      pe_ratio: '12.3400',
      pb_ratio: '1.2300',
      ...overrides,
    });

    it('maps canonical metadata, latest values, listing status, and current ratios', async () => {
      managerQuery.mockResolvedValueOnce([detailRow()]);

      const result = await service.detail('jkh.n0000');

      expect(managerQuery).toHaveBeenCalledWith(
        expect.stringContaining('lower(s.symbol) = lower($1)'),
        ['jkh.n0000'],
      );
      expect(result).toEqual({
        data: {
          symbol: 'JKH.N0000',
          company_name: 'John Keells Holdings PLC',
          cse_code: 'JKH.N0000',
          sector: { gics_code: '2010', name: 'Capital Goods' },
          shares_outstanding: 1513637385,
          data_from: '2017-01-02',
          data_to: '2025-12-31',
          listing_status: 'suspended',
          latest: {
            trade_date: '2025-12-31',
            close: 22.43,
            change: 0.18,
            change_pct: 0.81,
            volume: 1631334,
          },
          ratios: {
            valid_from: '2025-10-01',
            pe_ratio: 12.34,
            pb_ratio: 1.23,
          },
        },
      });
      expect(JSON.stringify(result)).not.toContain('security_id');
    });

    it.each([
      ['listed', 'listed'],
      ['resumed', 'listed'],
      [null, 'listed'],
      ['suspended', 'suspended'],
      ['delisted', 'delisted'],
    ])('maps a %s latest event to %s', async (eventType, status) => {
      managerQuery.mockResolvedValueOnce([
        detailRow({ event_type: eventType }),
      ]);

      const result = await service.detail('JKH.N0000');

      expect(result.data.listing_status).toBe(status);
    });

    it('returns null latest and ratios when the security has no history', async () => {
      managerQuery.mockResolvedValueOnce([
        detailRow({
          gics_code: null,
          sector_name: null,
          shares_outstanding: null,
          data_from: null,
          data_to: null,
          trade_date: null,
          close: null,
          volume: null,
          prev_close: null,
          valid_from: null,
          pe_ratio: null,
          pb_ratio: null,
        }),
      ]);

      const result = await service.detail('JKH.N0000');

      expect(result.data).toEqual(
        expect.objectContaining({
          sector: null,
          shares_outstanding: null,
          data_from: null,
          data_to: null,
          latest: null,
          ratios: null,
        }),
      );
    });

    it('leaves change fields null for the first stored price', async () => {
      managerQuery.mockResolvedValueOnce([detailRow({ prev_close: null })]);

      const result = await service.detail('JKH.N0000');

      expect(result.data.latest).toEqual(
        expect.objectContaining({ change: null, change_pct: null }),
      );
    });

    it('throws the shared not-found exception for an unknown symbol', async () => {
      managerQuery.mockResolvedValueOnce([]);

      await expect(service.detail('NOPE.X0000')).rejects.toMatchObject({
        code: 'SECURITY_NOT_FOUND',
      });
    });
  });

  describe('ohlcv', () => {
    const mockSecurity = () =>
      managerQuery.mockResolvedValueOnce([
        { security_id: 'security-1', symbol: 'JKH.N0000' },
      ]);

    it('maps daily bars, including nullable values, within inclusive ascending bounds', async () => {
      mockSecurity();
      managerQuery.mockResolvedValueOnce([
        {
          date: new Date(2025, 0, 2),
          open: null,
          high: '22.5900',
          low: '22.1300',
          close: '22.4300',
          adjusted_close: null,
          volume: '1631334',
        },
      ]);

      const result = await service.ohlcv('jkh.n0000', {
        timeframe: 'daily',
        from: '2025-01-02',
        to: '2025-01-03',
      });

      expect(managerQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('trade_date BETWEEN $2::date AND $3::date'),
        ['security-1', '2025-01-02', '2025-01-03'],
      );
      expect(managerQuery.mock.calls[1][0]).toContain(
        'ORDER BY trade_date ASC',
      );
      expect(result).toEqual({
        data: {
          symbol: 'JKH.N0000',
          timeframe: 'daily',
          from: '2025-01-02',
          to: '2025-01-03',
          bars: [
            {
              date: '2025-01-02',
              open: null,
              high: 22.59,
              low: 22.13,
              close: 22.43,
              adjusted_close: null,
              volume: 1631334,
            },
          ],
        },
      });
    });

    it.each(['weekly', 'monthly'] as const)(
      'maps %s aggregate bars and requires each period to fit the range',
      async (timeframe) => {
        mockSecurity();
        managerQuery.mockResolvedValueOnce([
          {
            period_start: '2025-01-06',
            period_end: new Date(2025, 0, 10),
            open: '22.4300',
            high: '22.8400',
            low: '21.7500',
            close: '22.7300',
            volume: '5186409',
          },
        ]);

        const result = await service.ohlcv('JKH.N0000', {
          timeframe,
          from: '2025-01-01',
          to: '2025-01-31',
        });

        expect(managerQuery).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('AND period_start >= $3::date'),
          ['security-1', timeframe, '2025-01-01', '2025-01-31'],
        );
        expect(managerQuery.mock.calls[1][0]).toContain(
          'AND period_end <= $4::date',
        );
        expect(managerQuery.mock.calls[1][0]).toContain(
          'ORDER BY period_start ASC',
        );
        expect(result.data.bars).toEqual([
          {
            period_start: '2025-01-06',
            period_end: '2025-01-10',
            open: 22.43,
            high: 22.84,
            low: 21.75,
            close: 22.73,
            volume: 5186409,
          },
        ]);
      },
    );

    it('defaults to the latest market date and one calendar year before it', async () => {
      mockSecurity();
      managerQuery
        .mockResolvedValueOnce([{ to: new Date(2024, 1, 29) }])
        .mockResolvedValueOnce([]);

      const result = await service.ohlcv('JKH.N0000', {
        timeframe: 'daily',
      });

      expect(result.data.from).toBe('2023-02-28');
      expect(result.data.to).toBe('2024-02-29');
      expect(managerQuery).toHaveBeenNthCalledWith(3, expect.any(String), [
        'security-1',
        '2023-02-28',
        '2024-02-29',
      ]);
    });

    it('returns null bounds and no bars when no market dates exist', async () => {
      mockSecurity();
      managerQuery.mockResolvedValueOnce([{ to: null }]);

      await expect(
        service.ohlcv('JKH.N0000', { timeframe: 'daily' }),
      ).resolves.toEqual({
        data: {
          symbol: 'JKH.N0000',
          timeframe: 'daily',
          from: null,
          to: null,
          bars: [],
        },
      });
      expect(managerQuery).toHaveBeenCalledTimes(2);
    });

    it('rejects a reversed resolved range and identifies from', async () => {
      mockSecurity();

      await expect(
        service.ohlcv('JKH.N0000', {
          timeframe: 'daily',
          from: '2025-02-01',
          to: '2025-01-31',
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        fields: [{ field: 'from', reason: 'must be before or equal to to' }],
      });
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });

    it('returns an empty bar list for a valid range with no data', async () => {
      mockSecurity();
      managerQuery.mockResolvedValueOnce([]);

      const result = await service.ohlcv('JKH.N0000', {
        timeframe: 'daily',
        from: '2000-01-01',
        to: '2000-12-31',
      });

      expect(result.data.bars).toEqual([]);
    });

    it('throws the shared not-found exception before resolving a range', async () => {
      managerQuery.mockResolvedValueOnce([]);

      await expect(
        service.ohlcv('NOPE.X0000', { timeframe: 'daily' }),
      ).rejects.toMatchObject({ code: 'SECURITY_NOT_FOUND' });
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });
  });
});

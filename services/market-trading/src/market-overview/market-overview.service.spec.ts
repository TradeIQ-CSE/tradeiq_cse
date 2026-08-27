import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ValidationFailedException } from '../common/errors/api-exception';
import { Sector } from '../entities/sector.entity';
import { Security } from '../entities/security.entity';
import { MarketOverviewQueryDto } from './dto/market-overview-query.dto';
import { MarketOverviewService } from './market-overview.service';

describe('MarketOverviewService', () => {
  let service: MarketOverviewService;
  let sectorsFindOne: jest.Mock;
  let managerQuery: jest.Mock;

  const query = (
    overrides: Partial<MarketOverviewQueryDto> = {},
  ): MarketOverviewQueryDto =>
    Object.assign(new MarketOverviewQueryDto(), overrides);

  const mockDateRange = () =>
    managerQuery.mockResolvedValueOnce([
      { from: '2017-01-02', to: '2025-12-31' },
    ]);

  beforeEach(async () => {
    managerQuery = jest.fn();
    sectorsFindOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketOverviewService,
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

    service = module.get(MarketOverviewService);
  });

  it('rejects an unknown sector before querying prices', async () => {
    sectorsFindOne.mockResolvedValue(null);

    await expect(
      service.getOverview(query({ sector: 'nope' })),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(managerQuery).not.toHaveBeenCalled();
  });

  it('returns empty rankings when no market session is available', async () => {
    managerQuery.mockResolvedValueOnce([{ from: null, to: null }]);

    await expect(service.getOverview(query())).resolves.toEqual({
      data: {
        as_of: null,
        gainers: [],
        losers: [],
        most_active: [],
      },
    });
    expect(managerQuery).toHaveBeenCalledTimes(1);
  });

  it('ranks each list deterministically and excludes missing metrics', async () => {
    mockDateRange();
    managerQuery.mockResolvedValueOnce([
      {
        symbol: 'B.N0000',
        company_name: 'Bravo PLC',
        close: '10.0000',
        change: '0.5000',
        change_pct: '5.00',
        change_pct_sort: '5.00000000',
        volume: '100',
      },
      {
        symbol: 'A.N0000',
        company_name: 'Alpha PLC',
        close: '21.0000',
        change: '1.0000',
        change_pct: '5.00',
        change_pct_sort: '5.00000000',
        volume: '200',
      },
      {
        symbol: 'E.N0000',
        company_name: 'Echo PLC',
        close: '9.8000',
        change: '-0.2000',
        change_pct: '-2.00',
        change_pct_sort: '-2.00000000',
        volume: '300',
      },
      {
        symbol: 'C.N0000',
        company_name: 'Charlie PLC',
        close: '9.8000',
        change: '-0.2000',
        change_pct: '-2.00',
        change_pct_sort: '-2.00000000',
        volume: '300',
      },
      {
        symbol: 'D.N0000',
        company_name: 'Delta PLC',
        close: '7.0000',
        change: null,
        change_pct: null,
        change_pct_sort: null,
        volume: '1000',
      },
      {
        symbol: 'F.N0000',
        company_name: 'Foxtrot PLC',
        close: '4.0400',
        change: '0.0400',
        change_pct: '1.00',
        change_pct_sort: '1.00000000',
        volume: null,
      },
    ]);

    const result = await service.getOverview(query({ limit: 2 }));

    expect(result.data.as_of).toBe('2025-12-31');
    expect(result.data.gainers.map(({ symbol }) => symbol)).toEqual([
      'A.N0000',
      'B.N0000',
    ]);
    expect(result.data.losers.map(({ symbol }) => symbol)).toEqual([
      'C.N0000',
      'E.N0000',
    ]);
    expect(result.data.most_active.map(({ symbol }) => symbol)).toEqual([
      'D.N0000',
      'C.N0000',
    ]);
    expect(result.data.gainers.map(({ rank }) => rank)).toEqual([1, 2]);
    expect(result.data.most_active[0]).toMatchObject({
      change: null,
      change_pct: null,
      volume: 1000,
    });
  });

  it('ranks by full precision before rounding the returned percentage', async () => {
    mockDateRange();
    managerQuery.mockResolvedValueOnce([
      {
        symbol: 'HIGHER.N0000',
        company_name: 'Higher Change PLC',
        close: '10.0000',
        change: '0.1000',
        change_pct: '1.00',
        change_pct_sort: '1.0049',
        volume: '10',
      },
      {
        symbol: 'LOWER.N0000',
        company_name: 'Lower Change PLC',
        close: '10.0000',
        change: '0.1000',
        change_pct: '1.00',
        change_pct_sort: '1.0041',
        volume: '1000',
      },
    ]);

    const result = await service.getOverview(query({ limit: 2 }));

    expect(result.data.gainers.map(({ symbol }) => symbol)).toEqual([
      'HIGHER.N0000',
      'LOWER.N0000',
    ]);
    expect(result.data.gainers.map(({ change_pct }) => change_pct)).toEqual([
      1, 1,
    ]);
  });

  it('settles a weekend request to the previous market session', async () => {
    mockDateRange();
    managerQuery
      .mockResolvedValueOnce([{ trade_date: '2025-08-15' }])
      .mockResolvedValueOnce([]);

    const result = await service.getOverview(query({ as_of: '2025-08-17' }));

    expect(managerQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE trade_date <= $1::date'),
      ['2025-08-17'],
    );
    expect(result.data.as_of).toBe('2025-08-15');
  });

  it('rejects a date outside the available price range', async () => {
    mockDateRange();

    await expect(
      service.getOverview(query({ as_of: '2016-12-31' })),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(managerQuery).toHaveBeenCalledTimes(1);
  });

  it('filters by a validated sector id', async () => {
    sectorsFindOne.mockResolvedValue({ sectorId: 'sector-uuid' });
    mockDateRange();
    managerQuery.mockResolvedValueOnce([]);

    await service.getOverview(query({ sector: '4010' }));

    expect(sectorsFindOne).toHaveBeenCalledWith({
      where: { gicsCode: '4010' },
    });
    expect(managerQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('s.sector_id = $2'),
      ['2025-12-31', 'sector-uuid'],
    );
  });

  it.each([
    ['large', '>= 20000000000'],
    ['mid', '>= 5000000000'],
    ['small', '< 5000000000'],
  ] as const)(
    'applies the %s market-cap band in SQL',
    async (band, fragment) => {
      mockDateRange();
      managerQuery.mockResolvedValueOnce([]);

      await service.getOverview(query({ market_cap: band }));

      expect(managerQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(fragment),
        ['2025-12-31'],
      );
    },
  );
});

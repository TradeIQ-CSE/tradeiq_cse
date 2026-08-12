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

  it('rejects an unknown sector code', async () => {
    sectorsFindOne.mockResolvedValue(null);

    await expect(
      service.list({ sector: 'nope', sort: 'symbol', page: 1, page_size: 50 }),
    ).rejects.toBeInstanceOf(ValidationFailedException);

    expect(managerQuery).not.toHaveBeenCalled();
  });

  it('maps rows into the contract response shape, computing change from prev_close', async () => {
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
      meta: { page: 1, page_size: 50, total: 1 },
    });
  });

  it('formats pg Date columns as YYYY-MM-DD, not RFC 3339 timestamps', async () => {
    managerQuery.mockResolvedValueOnce([{ total: '1' }]).mockResolvedValueOnce([
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
});

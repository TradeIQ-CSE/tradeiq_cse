import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  IndexNotFoundException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { IndicesService } from './indices.service';

describe('IndicesService', () => {
  let service: IndicesService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [IndicesService, { provide: DataSource, useValue: { query } }],
    }).compile();
    service = module.get(IndicesService);
  });

  const aspi = { index_code: 'ASPI', index_name: 'All Share Price Index' };

  describe('list', () => {
    it('computes the change from the previous value and says which date that was', async () => {
      query.mockResolvedValueOnce([
        {
          ...aspi,
          trade_date: '2025-12-31',
          close: '22149.0900',
          previous_date: '2025-12-30',
          previous_close: '22200.5000',
        },
        {
          index_code: 'SL20',
          index_name: 'S&P Sri Lanka 20',
          trade_date: '2025-12-31',
          close: '6210.4000',
          previous_date: null,
          previous_close: null,
        },
        {
          index_code: 'SL20TRI',
          index_name: 'S&P Sri Lanka 20 Total Return Index',
          trade_date: null,
          close: null,
          previous_date: null,
          previous_close: null,
        },
      ]);

      await expect(service.list({})).resolves.toEqual({
        data: [
          {
            code: 'ASPI',
            name: 'All Share Price Index',
            latest: {
              date: '2025-12-31',
              close: 22149.09,
              previous_date: '2025-12-30',
              change: -51.41,
              change_pct: -0.23,
            },
          },
          {
            code: 'SL20',
            name: 'S&P Sri Lanka 20',
            latest: {
              date: '2025-12-31',
              close: 6210.4,
              previous_date: null,
              change: null,
              change_pct: null,
            },
          },
          {
            code: 'SL20TRI',
            name: 'S&P Sri Lanka 20 Total Return Index',
            latest: null,
          },
        ],
      });
    });

    it('limits every index to values on or before as_of', async () => {
      query.mockResolvedValue([]);

      await service.list({ as_of: '2025-01-05' });
      await service.list({});

      expect(query.mock.calls[0][1]).toEqual(['2025-01-05']);
      expect(query.mock.calls[1][1]).toEqual([null]);
    });
  });

  describe('values', () => {
    it('reports an unknown code as not found', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.values('NOPE', {})).rejects.toBeInstanceOf(
        IndexNotFoundException,
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('defaults to the year ending at the latest index date and answers with the canonical code', async () => {
      query
        .mockResolvedValueOnce([aspi])
        .mockResolvedValueOnce([{ to: '2025-12-31' }])
        .mockResolvedValueOnce([
          { date: '2025-12-30', close: '21987.5000' },
          { date: '2025-12-31', close: '22149.0900' },
        ]);

      await expect(service.values('aspi', {})).resolves.toEqual({
        data: {
          code: 'ASPI',
          name: 'All Share Price Index',
          from: '2024-12-31',
          to: '2025-12-31',
          values: [
            { date: '2025-12-30', close: 21987.5 },
            { date: '2025-12-31', close: 22149.09 },
          ],
        },
      });
      expect(query.mock.calls[2][1]).toEqual([
        'ASPI',
        '2024-12-31',
        '2025-12-31',
      ]);
    });

    it('refuses a range that ends before it starts', async () => {
      query.mockResolvedValueOnce([aspi]);

      await expect(
        service.values('ASPI', { from: '2025-01-10', to: '2025-01-01' }),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    });

    it('answers an empty series when there is no index data at all', async () => {
      query.mockResolvedValueOnce([aspi]).mockResolvedValueOnce([{ to: null }]);

      await expect(service.values('ASPI', {})).resolves.toEqual({
        data: {
          code: 'ASPI',
          name: 'All Share Price Index',
          from: null,
          to: null,
          values: [],
        },
      });
    });

    it('cannot default the end of a range when there is no index data', async () => {
      query.mockResolvedValueOnce([aspi]).mockResolvedValueOnce([{ to: null }]);

      await expect(
        service.values('ASPI', { from: '2025-01-01' }),
      ).rejects.toMatchObject({ fields: [{ field: 'to' }] });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { DataCoverageController } from './data-coverage.controller';
import { DataCoverageService } from './data-coverage.service';

describe('DataCoverageController', () => {
  let controller: DataCoverageController;
  const service = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataCoverageController],
      providers: [{ provide: DataCoverageService, useValue: service }],
    }).compile();

    controller = module.get(DataCoverageController);
  });

  it('returns the service result under the shared { data } envelope', async () => {
    const coverage = {
      data: {
        prices: {
          from: '2017-01-02',
          to: '2026-09-23',
          gaps: [
            {
              from: '2026-01-01',
              to: '2026-06-12',
              sessions: 117,
              kind: 'missing_data' as const,
            },
          ],
        },
        indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
      },
    };
    service.get.mockResolvedValue(coverage);

    await expect(controller.get()).resolves.toEqual(coverage);
    expect(service.get).toHaveBeenCalledTimes(1);
  });
});

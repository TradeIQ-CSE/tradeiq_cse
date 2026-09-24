import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { BacktestPreviewController } from '../backtest-preview.controller';
import { BacktestRunsService } from '../backtest-runs.service';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';

describe('BacktestPreviewController', () => {
  let controller: BacktestPreviewController;
  const service = { previewRun: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacktestPreviewController],
      providers: [{ provide: BacktestRunsService, useValue: service }],
    }).compile();
    controller = module.get(BacktestPreviewController);
  });

  it('carries no auth guard: a visitor can preview without an account', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BacktestPreviewController),
    ).toBeUndefined();
  });

  it('returns the preview results from the service', async () => {
    const dto = { symbol: 'JKH' } as CreateBacktestRunDto;
    const results = {
      initialCapital: 1,
      finalCash: 1,
      finalEquity: 1,
      trades: [],
      equityCurve: [],
    };
    service.previewRun.mockResolvedValue(results);

    await expect(controller.preview(dto)).resolves.toBe(results);
    expect(service.previewRun).toHaveBeenCalledWith(dto);
  });
});

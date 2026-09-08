import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BacktestRunsController } from '../backtest-runs.controller';
import { BacktestRunsService } from '../backtest-runs.service';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';

const OWNER = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';

describe('BacktestRunsController', () => {
  let controller: BacktestRunsController;
  const service = {
    submitRun: jest.fn(),
    getRunStatus: jest.fn(),
    getRunResults: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacktestRunsController],
      providers: [{ provide: BacktestRunsService, useValue: service }],
    })
      // The guard is exercised in jwt-auth.guard.spec.ts; here it only has to
      // resolve so the controller can be constructed.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(BacktestRunsController);
  });

  // Every route passes the owner straight to the service, which scopes its
  // queries by it. These three are what the request-header owner used to feed.
  it('submits a run owned by the authenticated user', async () => {
    service.submitRun.mockResolvedValue({ id: 'run-1' });
    const dto = {} as CreateBacktestRunDto;

    await expect(controller.submitRun({ userId: OWNER }, dto)).resolves.toEqual(
      { id: 'run-1', status: 'queued' },
    );
    expect(service.submitRun).toHaveBeenCalledWith(dto, OWNER);
  });

  it('scopes a status read to the authenticated user', async () => {
    service.getRunStatus.mockResolvedValue({
      id: 'run-1',
      status: 'completed',
      createdAt: null,
      startedAt: null,
      completedAt: null,
    });

    await controller.getStatus({ userId: OWNER }, 'run-1');
    expect(service.getRunStatus).toHaveBeenCalledWith('run-1', OWNER);
  });

  it('scopes a results read to the authenticated user', async () => {
    service.getRunResults.mockResolvedValue({
      summaryMetrics: { initialCapital: 1, finalCash: 2, finalEquity: 3 },
      tradeLedger: [],
      equityCurve: [],
    });

    await controller.getResults({ userId: OWNER }, 'run-1');
    expect(service.getRunResults).toHaveBeenCalledWith('run-1', OWNER);
  });

  // The owner is only trustworthy because a verified token produced it. Losing
  // the guard would leave the routes reachable with no user at all, so the
  // decoration is asserted rather than assumed: this fails the moment
  // @UseGuards is dropped from the controller.
  it('guards every route with JWT authentication', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      BacktestRunsController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });
});

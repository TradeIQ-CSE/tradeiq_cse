import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  DependencyUnavailableException,
  IngestionUnavailableException,
  PortfolioNotFoundException,
  ValidationFailedException,
} from '../errors/api-exception';
import { BacktestApiError } from '../../backtest-runs/errors/backtest-api-error';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Envelope {
  error: {
    code: string;
    message: string;
    fields?: { field: string; reason: string }[];
    details?: unknown;
    trace_id: string;
  };
}

function render(exception: unknown): { status: number; body: Envelope } {
  const filter = new AllExceptionsFilter();
  let status = 0;
  let body: Envelope | undefined;
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (code: number) => {
          status = code;
          return {
            json: (payload: Envelope) => {
              body = payload;
            },
          };
        },
      }),
    }),
  } as unknown as ArgumentsHost;

  filter.catch(exception, host);
  return { status, body: body as Envelope };
}

describe('AllExceptionsFilter', () => {
  // The 5xx cases log a stack; silence it so a passing run stays readable.
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('renders a 4xx ApiException with its own code, message and fields', () => {
    const { status, body } = render(
      new ValidationFailedException([{ field: 'as_of', reason: 'bad' }]),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: [{ field: 'as_of', reason: 'bad' }],
    });
    expect(body.error.trace_id).toEqual(expect.any(String));
  });

  it('keeps a 404 domain code rather than flattening it', () => {
    const { status, body } = render(new PortfolioNotFoundException());

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error.code).toBe('PORTFOLIO_NOT_FOUND');
  });

  // error-envelope.md §2 — DEPENDENCY_UNAVAILABLE means the caller may retry,
  // and paper-trading-v1.md §4 leaves the idempotency key reusable on it. A
  // 503 rendered as INTERNAL tells the caller the opposite of both.
  it.each([
    ['a dependency failure', new DependencyUnavailableException()],
    ['a disabled ingestion API', new IngestionUnavailableException()],
  ])('preserves the code on a 503 from %s', (_label, exception) => {
    const { status, body } = render(exception);

    expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  // docs/plans/data-gap-handling.md §2 — the caller needs the gap's bounds to
  // show a useful message, and error-envelope.md documents `details` for
  // exactly this.
  it('surfaces details on DATE_IN_DATA_GAP', () => {
    const { status, body } = render(
      new BacktestApiError(
        'DATE_IN_DATA_GAP',
        'No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.',
        { field: 'startDate', from: '2026-01-01', to: '2026-06-12' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
    );

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toMatchObject({
      code: 'DATE_IN_DATA_GAP',
      details: { field: 'startDate', from: '2026-01-01', to: '2026-06-12' },
    });
  });

  it('omits details for a BacktestApiError code that carries none', () => {
    const { body } = render(
      new BacktestApiError('INSUFFICIENT_PRICE_HISTORY', 'No bars found.'),
    );

    expect(body.error.code).toBe('INSUFFICIENT_PRICE_HISTORY');
    expect(body.error).not.toHaveProperty('details');
  });

  it('redacts a genuine 500 to INTERNAL', () => {
    const { status, body } = render(new Error('connection string: secret'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error).toEqual({
      code: 'INTERNAL',
      message: 'An unexpected error occurred.',
      trace_id: expect.any(String),
    });
  });

  it('redacts a 500 raised as an HttpException, message included', () => {
    const { body } = render(
      new HttpException('internal detail', HttpStatus.INTERNAL_SERVER_ERROR),
    );

    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('An unexpected error occurred.');
  });
});

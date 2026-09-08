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
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Envelope {
  error: {
    code: string;
    message: string;
    fields?: { field: string; reason: string }[];
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

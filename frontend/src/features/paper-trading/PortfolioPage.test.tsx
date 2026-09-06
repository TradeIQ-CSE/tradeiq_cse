import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { server } from '../../test/server';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../../test/render';
import {
  cashTransactionsFixture,
  portfolioFixture,
  positionsFixture,
  summaryFixture,
} from '../../test/fixtures/paper-trading';
import { PortfolioPage } from './PortfolioPage';

const t = i18n.t.bind(i18n);

function errorBody(code: string, message: string) {
  return { error: { code, message, trace_id: 'test-trace' } };
}

// ?portfolioId= is the source of truth, so a test that wants a specific
// portfolio in scope seeds it through the router. localStorage is only the
// bootstrap path and is exercised separately.
function renderPage(portfolioId: string = portfolioFixture.portfolio_id) {
  return renderWithProviders(<PortfolioPage />, {
    initialEntries: [`/portfolio?portfolioId=${portfolioId}`],
  });
}

function renderWithNoPortfolios() {
  server.use(
    http.get('*/portfolios', () =>
      HttpResponse.json({ data: [], meta: { page: 1, page_size: 50, total: 0 } }),
    ),
  );
  return renderWithProviders(<PortfolioPage />, { initialEntries: ['/portfolio'] });
}

async function fillCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText(t('portfolio.create.name')),
    'Evaluation portfolio',
  );
  await user.type(screen.getByLabelText(t('portfolio.create.startingCapital')), '1000000');
  return screen.getByRole('button', { name: t('portfolio.create.submit') });
}

describe('PortfolioPage', () => {
  it('offers the create form, not a table, when there are no portfolios', async () => {
    renderWithNoPortfolios();

    expect(await screen.findByText(t('portfolio.scope.empty'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('portfolio.create.submit') }),
    ).toBeInTheDocument();
    expect(screen.queryByText(t('portfolio.positions.title'))).not.toBeInTheDocument();
  });

  it('renders summary and positions from the API', async () => {
    renderPage();

    // The card heading renders before its rows arrive, so wait on a row.
    expect(await screen.findByText(positionsFixture[0].symbol)).toBeInTheDocument();
    expect(screen.getByText(t('portfolio.positions.title'))).toBeInTheDocument();
    for (const position of positionsFixture) {
      expect(screen.getByText(position.symbol)).toBeInTheDocument();
    }
    // Both the summary and the positions card state the priced session.
    expect(
      screen.getAllByText(t('portfolio.summary.asOf', { date: summaryFixture.as_of })).length,
    ).toBeGreaterThan(0);
  });

  // CashLedger isn't remounted when the selector switches portfolios (no
  // `key` on it in PortfolioPage), so an unscoped `placeholderData: (previous)
  // => previous` in useCashTransactions would keep rendering portfolio A's
  // rows — as non-`isPending` "placeholder" data — under portfolio B's
  // heading for as long as B's request is in flight.
  it("does not render a previous portfolio's cash rows while switching to another portfolio", async () => {
    const portfolioB = { ...portfolioFixture, portfolio_id: '55555555-5555-4555-8555-555555555555', name: 'Second portfolio' };
    const summaryB = { ...summaryFixture, portfolio_id: portfolioB.portfolio_id };
    const cashTransactionsB = [
      {
        transaction_id: '66666666-6666-4666-8666-666666666666',
        type: 'initial_capital' as const,
        amount: 500_000,
        balance_after: 500_000,
        effective_date: '2025-02-01',
        fill_id: null,
        created_at: '2026-08-27T14:00:00Z',
      },
    ];

    let releaseB: (() => void) | undefined;
    const heldB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });

    server.use(
      http.get('*/portfolios', () =>
        HttpResponse.json({
          data: [portfolioFixture, portfolioB],
          meta: { page: 1, page_size: 50, total: 2 },
        }),
      ),
      http.get('*/portfolios/:portfolioId/summary', ({ params }) =>
        HttpResponse.json({
          data: params.portfolioId === portfolioB.portfolio_id ? summaryB : summaryFixture,
        }),
      ),
      http.get('*/portfolios/:portfolioId/positions', ({ params }) =>
        HttpResponse.json({
          data: params.portfolioId === portfolioB.portfolio_id ? [] : positionsFixture,
          meta: {
            as_of: summaryFixture.as_of,
            total: params.portfolioId === portfolioB.portfolio_id ? 0 : positionsFixture.length,
          },
        }),
      ),
      http.get('*/portfolios/:portfolioId/cash-transactions', async ({ params }) => {
        if (params.portfolioId === portfolioB.portfolio_id) {
          await heldB;
          return HttpResponse.json({
            data: cashTransactionsB,
            meta: { page: 1, page_size: 50, total: cashTransactionsB.length },
          });
        }
        return HttpResponse.json({
          data: cashTransactionsFixture,
          meta: { page: 1, page_size: 50, total: cashTransactionsFixture.length },
        });
      }),
    );

    const user = userEvent.setup({ delay: null });
    renderPage(); // Defaults to portfolioFixture (A).

    expect(await screen.findByText(cashTransactionsFixture[0].effective_date)).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(t('portfolio.selector.label')),
      portfolioB.portfolio_id,
    );

    // B's cash-transactions request is held open: A's row must not still be
    // on screen under B's heading while it's in flight.
    await waitFor(() =>
      expect(screen.queryByText(cashTransactionsFixture[0].effective_date)).not.toBeInTheDocument(),
    );

    releaseB?.();

    expect(await screen.findByText(cashTransactionsB[0].effective_date)).toBeInTheDocument();
  });

  // ADR 0008 forbids the frontend deriving any money figure. The fixture is
  // built so cash + holdings - starting (18,342.40) differs from the total_pnl
  // field (17,000.00): computing it instead of reading it renders the wrong
  // number and fails here.
  it('reads total P/L from the API field rather than deriving it', async () => {
    renderPage();

    expect(await screen.findByText('LKR +17,000.00')).toBeInTheDocument();
    expect(screen.queryByText('LKR +18,342.40')).not.toBeInTheDocument();
  });

  it('shows the valuation date the API returned, not the one that was asked for', async () => {
    // A Saturday. The service settles back to the preceding session and
    // echoes that date (docs/api/paper-trading-v1.md §7.1/§7.2: "a weekend or
    // holiday request settles to the preceding session and reports it"), so
    // the page must show what came back, not the input's value. The default
    // handlers always answer with the fixture's fixed `as_of` regardless of
    // what was requested, which can't distinguish a correct implementation
    // from one that never sends `as_of` at all — so this test overrides the
    // handlers to both capture the requested param and echo back a
    // deliberately different effective date.
    const requested = '2025-01-11';
    const effective = '2025-01-10';
    const requestedAsOfValues: (string | null)[] = [];

    server.use(
      http.get('*/portfolios/:portfolioId/summary', ({ request }) => {
        requestedAsOfValues.push(new URL(request.url).searchParams.get('as_of'));
        return HttpResponse.json({ data: { ...summaryFixture, as_of: effective } });
      }),
      http.get('*/portfolios/:portfolioId/positions', () =>
        HttpResponse.json({
          data: positionsFixture,
          meta: { as_of: effective, total: positionsFixture.length },
        }),
      ),
    );

    renderPage();
    await screen.findByText(t('portfolio.positions.title'));

    fireEvent.change(screen.getByLabelText(t('portfolio.asOfLabel')), {
      target: { value: requested },
    });

    // (a) the picker's value actually reached the request.
    await waitFor(() => expect(requestedAsOfValues).toContain(requested));

    // (b) what's displayed is the response's effective date, not the requested one.
    expect(
      (await screen.findAllByText(t('portfolio.summary.asOf', { date: effective }))).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(t('portfolio.summary.asOf', { date: requested })),
    ).not.toBeInTheDocument();
  });

  // Positions and summary fail 422 wholesale when a held symbol has no close
  // for the session — there is no partial list, and retrying the same date can
  // never succeed, so the page has to say something the user can act on.
  it('offers a way out of PRICE_UNAVAILABLE instead of an empty table', async () => {
    server.use(
      http.get('*/portfolios/:portfolioId/positions', () =>
        HttpResponse.json(
          errorBody('PRICE_UNAVAILABLE', 'No close for MISS.N0000 on 2025-01-10.'),
          { status: 422 },
        ),
      ),
    );

    renderPage();

    expect(
      await screen.findByText(
        t('portfolio.positions.priceUnavailable', {
          date: t('portfolio.summary.latestSession'),
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(t('portfolio.positions.empty'))).not.toBeInTheDocument();
  });

  // Found by running against the real stack: an as_of outside the seeded price
  // range answers 400 VALIDATION_FAILED whose `message` is only "Request
  // validation failed." — the range that would work is in `fields[]`. Showing
  // just the message leaves the reader with nothing to act on.
  it('shows the field reason for a rejected valuation date, not the generic message', async () => {
    server.use(
      http.get('*/portfolios/:portfolioId/positions', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Request validation failed.',
              fields: [
                { field: 'as_of', reason: 'must fall between 2025-01-02 and 2025-01-10' },
              ],
              trace_id: 'test-trace',
            },
          },
          { status: 400 },
        ),
      ),
    );

    renderPage();

    expect(
      await screen.findByText('must fall between 2025-01-02 and 2025-01-10'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Request validation failed.')).not.toBeInTheDocument();
  });

  it('recovers from a selected portfolio id that no longer exists', async () => {
    const staleId = '99999999-9999-4999-8999-999999999999';
    server.use(
      http.get('*/portfolios/:portfolioId/summary', ({ params }) =>
        params.portfolioId === staleId
          ? HttpResponse.json(errorBody('PORTFOLIO_NOT_FOUND', 'Not found.'), { status: 404 })
          : HttpResponse.json({ data: summaryFixture }),
      ),
      http.get('*/portfolios/:portfolioId/positions', ({ params }) =>
        params.portfolioId === staleId
          ? HttpResponse.json(errorBody('PORTFOLIO_NOT_FOUND', 'Not found.'), { status: 404 })
          : HttpResponse.json({
              data: positionsFixture,
              meta: { as_of: summaryFixture.as_of, total: positionsFixture.length },
            }),
      ),
    );

    renderPage(staleId);

    // Falls back to the one live portfolio rather than sitting on the error.
    expect(await screen.findByText('COMB.N0000')).toBeInTheDocument();
    expect(screen.queryByText('Not found.')).not.toBeInTheDocument();
  });

  // Distinct from the previous test: `staleId` there was never in the list,
  // so the fallback always had somewhere to go. Here the rejected id IS the
  // list's only entry — with no un-rejected candidate left, `portfolioId`
  // stays null while `portfolios.length` is still 1, and the old code
  // rendered neither the empty state nor the scoped children: a blank panel.
  it('offers a way forward when the only portfolio in a stale list 404s', async () => {
    server.use(
      http.get('*/portfolios/:portfolioId/summary', () =>
        HttpResponse.json(errorBody('PORTFOLIO_NOT_FOUND', 'Not found.'), { status: 404 }),
      ),
      http.get('*/portfolios/:portfolioId/positions', () =>
        HttpResponse.json(errorBody('PORTFOLIO_NOT_FOUND', 'Not found.'), { status: 404 }),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('button', { name: t('portfolio.create.submit') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Not found.')).not.toBeInTheDocument();
  });

  it('marks a gain and a loss with more than colour', async () => {
    renderPage();

    // positionsFixture[0] (COMB) is a gain and [1] (JKH) is a loss. Scoping
    // each assertion to its own row (rather than asserting one of each glyph
    // exists anywhere in the document) catches the sign check in
    // `changeDirection` being swapped, which would still put one ▲ and one ▼
    // on the page, just on the wrong rows.
    // Each row renders the glyph twice (P/L and return %), so scope with
    // getAllByText rather than getByText.
    const gainSymbol = await screen.findByText(positionsFixture[0].symbol);
    const gainRow = gainSymbol.closest('.positions-row');
    if (!gainRow) throw new Error('gain row not found');
    expect(within(gainRow as HTMLElement).getAllByText('▲').length).toBeGreaterThan(0);
    expect(within(gainRow as HTMLElement).queryByText('▼')).not.toBeInTheDocument();

    const lossRow = screen.getByText(positionsFixture[1].symbol).closest('.positions-row');
    if (!lossRow) throw new Error('loss row not found');
    expect(within(lossRow as HTMLElement).getAllByText('▼').length).toBeGreaterThan(0);
    expect(within(lossRow as HTMLElement).queryByText('▲')).not.toBeInTheDocument();
  });

  it('surfaces an unreachable API rather than rendering an empty page', async () => {
    server.use(http.get('*/portfolios', () => HttpResponse.error()));

    renderWithProviders(<PortfolioPage />, { initialEntries: ['/portfolio'] });

    expect(await screen.findByText(t('portfolio.scope.unreachable'))).toBeInTheDocument();
  });
});

describe('CreatePortfolioForm', () => {
  it('sends an Idempotency-Key with the create request', async () => {
    const keys: string[] = [];
    server.use(
      http.post('*/portfolios', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json({ data: portfolioFixture }, { status: 201 });
      }),
    );

    const user = userEvent.setup({ delay: null });
    renderWithNoPortfolios();
    await user.click(await fillCreateForm(user));

    await waitFor(() => expect(keys).toHaveLength(1));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Two submits in the SAME tick, which is what a real double-click or a
  // double Enter produces. `disabled={isPending}` cannot catch this — the flag
  // only flips on the next render — so only the synchronous ref guard stops
  // the second one. Awaiting between two clicks would let the first finish and
  // prove nothing, so the request is held open while both are fired.
  it('issues one request for two submits fired in the same tick', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;

    server.use(
      http.post('*/portfolios', async () => {
        requests += 1;
        await held;
        return HttpResponse.json({ data: portfolioFixture }, { status: 201 });
      }),
    );

    const user = userEvent.setup({ delay: null });
    renderWithNoPortfolios();
    const submit = await fillCreateForm(user);
    const form = submit.closest('form');
    if (!form) throw new Error('create form not found');

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(requests).toBeGreaterThan(0));
    expect(requests).toBe(1);

    release?.();
  });

  it('puts a 400 VALIDATION_FAILED on the field it names', async () => {
    server.use(
      http.post('*/portfolios', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Request validation failed.',
              fields: [{ field: 'starting_capital', reason: 'must not be less than 100000' }],
              trace_id: 'test-trace',
            },
          },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup({ delay: null });
    renderWithNoPortfolios();
    await user.click(await fillCreateForm(user));

    expect(await screen.findByText('must not be less than 100000')).toBeInTheDocument();
  });

  it('rotates the key after a 409 so the retry is a new submission', async () => {
    const keys: string[] = [];
    server.use(
      http.post('*/portfolios', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return keys.length === 1
          ? HttpResponse.json(errorBody('IDEMPOTENCY_KEY_REUSED', 'Key already used.'), {
              status: 409,
            })
          : HttpResponse.json({ data: portfolioFixture }, { status: 201 });
      }),
    );

    const user = userEvent.setup({ delay: null });
    renderWithNoPortfolios();
    const submit = await fillCreateForm(user);

    await user.click(submit);
    expect(
      await screen.findByText(t('portfolio.create.errors.idempotencyReused')),
    ).toBeInTheDocument();

    await user.click(submit);
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).not.toBe(keys[1]);
  });
});

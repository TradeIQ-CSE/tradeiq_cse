import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, waitFor, within } from '../../test/render';
import { server } from '../../test/server';
import {
  dailyOhlcvFixture,
  securityDetailFixture,
} from '../../test/fixtures/security-detail';
import i18n from '../../i18n';
import { SecurityDetailPage } from './SecurityDetailPage';

const t = i18n.t.bind(i18n);

function renderPage(path = '/markets/jkh.n0000') {
  return renderWithProviders(
    <Routes>
      <Route path="/markets/:symbol" element={<SecurityDetailPage />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

function DetailWithNavigation() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/markets/COMB.N0000')}>
        Open COMB
      </button>
      <SecurityDetailPage />
    </>
  );
}

describe('SecurityDetailPage', () => {
  it('loads a lowercase URL and renders the API canonical symbol and real detail values', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: securityDetailFixture.symbol }),
    ).toBeInTheDocument();
    expect(screen.getByText(securityDetailFixture.company_name)).toBeInTheDocument();
    expect(screen.getByText('Consumer Discretionary')).toBeInTheDocument();
    expect(screen.getByText('871,355,047')).toBeInTheDocument();
    const from = screen.getByLabelText(t('securityDetail.range.from'));
    const to = screen.getByLabelText(t('securityDetail.range.to'));
    await waitFor(() => expect(from).toHaveValue(dailyOhlcvFixture.from));
    expect(to).toHaveValue(dailyOhlcvFixture.to);
    expect(from).toHaveAttribute('min', securityDetailFixture.data_from);
    expect(to).toHaveAttribute('max', securityDetailFixture.data_to);
    expect(
      await screen.findByRole('table', {
        name: t('securityDetail.chart.accessibleLabel', {
          symbol: 'JKH.N0000',
          timeframe: t('securityDetail.timeframes.daily'),
        }),
      }),
    ).toBeInTheDocument();
  });

  it('renders nullable latest price and ratios without inventing values', async () => {
    server.use(
      http.get('*/securities/:symbol', () =>
        HttpResponse.json({
          data: {
            ...securityDetailFixture,
            latest: null,
            ratios: null,
          },
        }),
      ),
    );
    renderPage();

    expect(
      await screen.findByText(t('securityDetail.states.noLatestPrice')),
    ).toBeInTheDocument();
    const peItem = screen.getByText(t('securityDetail.info.peRatio')).parentElement;
    const pbItem = screen.getByText(t('securityDetail.info.pbRatio')).parentElement;
    expect(peItem).toHaveTextContent('—');
    expect(pbItem).toHaveTextContent('—');
  });

  it('sends committed dates exactly and retains them across timeframe changes', async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    server.use(
      http.get('*/securities/:symbol/ohlcv', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return HttpResponse.json({
          data: {
            ...dailyOhlcvFixture,
            timeframe: url.searchParams.get('timeframe') ?? 'daily',
            from: url.searchParams.get('from') ?? dailyOhlcvFixture.from,
            to: url.searchParams.get('to') ?? dailyOhlcvFixture.to,
          },
        });
      }),
    );
    renderPage();

    const from = await screen.findByLabelText(t('securityDetail.range.from'));
    const to = screen.getByLabelText(t('securityDetail.range.to'));
    await waitFor(() => expect(from).toHaveValue(dailyOhlcvFixture.from));

    fireEvent.change(from, { target: { value: '2026-08-01' } });
    fireEvent.change(to, { target: { value: '2026-08-31' } });
    await user.click(
      screen.getByRole('button', { name: t('securityDetail.actions.apply') }),
    );

    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('from')).toBe('2026-08-01');
      expect(requests.at(-1)?.searchParams.get('to')).toBe('2026-08-31');
    });

    await user.click(
      screen.getByRole('button', {
        name: t('securityDetail.timeframes.weekly'),
      }),
    );
    await waitFor(() => {
      const last = requests.at(-1);
      expect(last?.searchParams.get('timeframe')).toBe('weekly');
      expect(last?.searchParams.get('from')).toBe('2026-08-01');
      expect(last?.searchParams.get('to')).toBe('2026-08-31');
    });

    await user.click(
      screen.getByRole('button', { name: t('securityDetail.actions.reset') }),
    );
    await waitFor(() => {
      const last = requests.at(-1);
      expect(last?.searchParams.get('timeframe')).toBe('weekly');
      expect(last?.searchParams.has('from')).toBe(false);
      expect(last?.searchParams.has('to')).toBe(false);
    });
  });

  it('validates from <= to before refetching and associates the error with both inputs', async () => {
    const user = userEvent.setup();
    let requestCount = 0;
    server.use(
      http.get('*/securities/:symbol/ohlcv', () => {
        requestCount += 1;
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );
    renderPage();
    const from = await screen.findByLabelText(t('securityDetail.range.from'));
    const to = screen.getByLabelText(t('securityDetail.range.to'));
    await waitFor(() => expect(requestCount).toBe(1));

    fireEvent.change(from, { target: { value: '2026-08-31' } });
    fireEvent.change(to, { target: { value: '2026-08-01' } });
    await user.click(
      screen.getByRole('button', { name: t('securityDetail.actions.apply') }),
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t('securityDetail.range.fromAfterTo'));
    expect(from).toHaveAttribute('aria-describedby', alert.id);
    expect(to).toHaveAttribute('aria-describedby', alert.id);
    expect(from).toHaveAttribute('aria-invalid', 'true');
    expect(requestCount).toBe(1);
  });

  it('resets timeframe and range defaults when the route symbol changes', async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    server.use(
      http.get('*/securities/:symbol/ohlcv', ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/markets/:symbol" element={<DetailWithNavigation />} />
      </Routes>,
      { initialEntries: ['/markets/JKH.N0000'] },
    );

    const from = await screen.findByLabelText(t('securityDetail.range.from'));
    const to = screen.getByLabelText(t('securityDetail.range.to'));
    await waitFor(() => expect(from).toHaveValue(dailyOhlcvFixture.from));
    fireEvent.change(from, { target: { value: '2026-08-01' } });
    fireEvent.change(to, { target: { value: '2026-08-31' } });
    await user.click(
      screen.getByRole('button', { name: t('securityDetail.actions.apply') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('securityDetail.timeframes.monthly') }),
    );
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get('timeframe')).toBe('monthly');
    });

    await user.click(screen.getByRole('button', { name: 'Open COMB' }));
    await waitFor(() => {
      const combRequest = requests.find((request) =>
        request.pathname.includes('/COMB.N0000/ohlcv'),
      );
      expect(combRequest?.searchParams.get('timeframe')).toBe('daily');
      expect(combRequest?.searchParams.has('from')).toBe(false);
      expect(combRequest?.searchParams.has('to')).toBe(false);
    });
  });

  it('renders structured server field errors beside the range controls', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/securities/:symbol/ohlcv', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has('from')) {
          return HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Request validation failed.',
                fields: [{ field: 'from', reason: 'must be a trading date' }],
                trace_id: 'trace-fields',
              },
            },
            { status: 400 },
          );
        }
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );
    renderPage();
    const from = await screen.findByLabelText(t('securityDetail.range.from'));
    const to = screen.getByLabelText(t('securityDetail.range.to'));
    await waitFor(() => expect(from).toHaveValue(dailyOhlcvFixture.from));
    fireEvent.change(from, { target: { value: '2026-08-01' } });
    fireEvent.change(to, { target: { value: '2026-08-31' } });
    await user.click(
      screen.getByRole('button', { name: t('securityDetail.actions.apply') }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'from: must be a trading date',
    );
    expect(screen.getByText(t('securityDetail.chart.validationFailed'))).toBeInTheDocument();
  });

  it('keeps security details visible when the chart service fails and offers retry', async () => {
    server.use(
      http.get('*/securities/:symbol/ohlcv', () =>
        HttpResponse.json(
          {
            error: {
              code: 'DEPENDENCY_UNAVAILABLE',
              message: 'OHLCV storage is temporarily unavailable.',
              trace_id: 'trace-chart',
            },
          },
          { status: 503 },
        ),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole('heading', { name: securityDetailFixture.symbol }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('OHLCV storage is temporarily unavailable.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('securityDetail.actions.retry') })).toBeInTheDocument();
  });

  it('explains a valid empty range without substituting fixture bars', async () => {
    server.use(
      http.get('*/securities/:symbol/ohlcv', () =>
        HttpResponse.json({
          data: { ...dailyOhlcvFixture, bars: [] },
        }),
      ),
    );
    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: t('securityDetail.chart.empty.title'),
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows distinct detail loading, not-found, and unavailable states', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/securities/:symbol', async () => {
        await gate;
        return HttpResponse.json({ data: securityDetailFixture });
      }),
    );
    const loadingView = renderPage();
    expect(
      await screen.findByRole('heading', { name: t('securityDetail.states.loading') }),
    ).toBeInTheDocument();
    release();
    await screen.findByRole('heading', { name: securityDetailFixture.symbol });
    loadingView.unmount();

    server.use(
      http.get('*/securities/:symbol', () =>
        HttpResponse.json(
          {
            error: {
              code: 'SECURITY_NOT_FOUND',
              message: 'Security not found.',
              trace_id: 'trace-404',
            },
          },
          { status: 404 },
        ),
      ),
    );
    const notFoundView = renderPage('/markets/nope.n0000');
    expect(
      await screen.findByRole('heading', { name: 'nope.n0000 was not found' }),
    ).toBeInTheDocument();
    notFoundView.unmount();

    server.use(
      http.get('*/securities/:symbol', () => HttpResponse.error()),
    );
    renderPage();
    const unavailable = await screen.findByRole('heading', {
      name: t('securityDetail.states.unavailable.title'),
    });
    expect(unavailable).toBeInTheDocument();
    const state = unavailable.closest('section');
    expect(state).not.toBeNull();
    expect(within(state as HTMLElement).getByRole('button', {
      name: t('securityDetail.actions.retry'),
    })).toBeInTheDocument();
  });
});

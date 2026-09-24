import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { server } from '../../test/server';
import { indicesFixture } from '../../test/fixtures/indices';
import { dataCoverageFixture } from '../../test/fixtures/data-coverage';
import { DataGap } from '../../lib/data-gaps';
import { IndexOverview } from './IndexOverview';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('IndexOverview', () => {
  it('renders the latest close and change for ASPI and SL20 only', async () => {
    renderWithProviders(<IndexOverview />);

    expect(await screen.findByText('ASPI')).toBeInTheDocument();
    expect(screen.getByText('SL20')).toBeInTheDocument();
    expect(screen.getByText('15,736.91')).toBeInTheDocument();
    expect(screen.getByText('4,734.44')).toBeInTheDocument();

    // The API also returns the two total-return series; only ASPI/SL20 were
    // asked for, so those must not leak into the panel.
    expect(screen.queryByText('ASTRI')).not.toBeInTheDocument();
    expect(screen.queryByText('SL20TRI')).not.toBeInTheDocument();
  });

  it('renders a chart for each index from its own values series', async () => {
    renderWithProviders(<IndexOverview />);

    await waitFor(() => expect(screen.getAllByRole('group')).toHaveLength(2));
  });

  it('opens both charts on the latest full year with data when the trailing year crosses a gap', async () => {
    const gap: DataGap = {
      from: '2026-01-01',
      to: '2026-09-08',
      sessions: 179,
      kind: 'missing_data',
    };
    server.use(
      http.get('*/coverage', () =>
        HttpResponse.json({
          data: {
            ...dataCoverageFixture,
            indices: { ...dataCoverageFixture.indices, gaps: [gap] },
          },
        }),
      ),
    );
    const requests: URL[] = [];
    server.use(
      http.get('*/indices/:code/values', ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({
          data: {
            code: 'ASPI',
            name: 'All Share Price Index',
            from: '2025-01-01',
            to: '2025-12-31',
            values: [
              { date: '2025-12-30', close: 22000 },
              { date: '2025-12-31', close: 22100 },
            ],
          },
        });
      }),
    );

    renderWithProviders(<IndexOverview />);
    await waitFor(() => expect(screen.getAllByRole('group')).toHaveLength(2));

    // One request per card, each already carrying the gap-free window: no
    // earlier fetch of the API's gap-crossing trailing year.
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.searchParams.get('from')).toBe('2025-01-01');
      expect(request.searchParams.get('to')).toBe('2025-12-31');
    }
  });

  it('says which index dates are missing and switches both charts to the run since the gap', async () => {
    const gap: DataGap = {
      from: '2026-01-01',
      to: '2026-09-08',
      sessions: 179,
      kind: 'missing_data',
    };
    server.use(
      http.get('*/coverage', () =>
        HttpResponse.json({
          data: {
            ...dataCoverageFixture,
            indices: { ...dataCoverageFixture.indices, gaps: [gap] },
          },
        }),
      ),
    );
    const requests: URL[] = [];
    server.use(
      http.get('*/indices/:code/values', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return HttpResponse.json({
          data: {
            code: 'ASPI',
            name: 'All Share Price Index',
            from: url.searchParams.get('from'),
            to: url.searchParams.get('to'),
            values: [
              { date: '2026-09-22', close: 21054.01 },
              { date: '2026-09-23', close: 21085.15 },
            ],
          },
        });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<IndexOverview />);

    expect(
      await screen.findByText(
        t('markets.indices.gapNote', { range: 'Jan 1 to Sep 8, 2026' }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2025' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Since Sep 9, 2026' }));

    await waitFor(() => expect(requests).toHaveLength(4));
    for (const request of requests.slice(2)) {
      expect(request.searchParams.get('from')).toBe('2026-09-09');
      expect(request.searchParams.get('to')).toBe('2026-09-23');
    }
  });

  it("keeps the API's own default range when coverage reports no gap", async () => {
    const requests: URL[] = [];
    server.use(
      http.get('*/indices/:code/values', ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({
          data: {
            code: 'ASPI',
            name: 'All Share Price Index',
            from: '2025-09-24',
            to: '2026-09-23',
            values: [{ date: '2026-09-23', close: 21085.15 }],
          },
        });
      }),
    );

    renderWithProviders(<IndexOverview />);
    await waitFor(() => expect(requests).toHaveLength(2));
    for (const request of requests) {
      expect(request.searchParams.has('from')).toBe(false);
    }
  });

  it('shows a plain message when an index has no latest value', async () => {
    server.use(
      http.get('*/indices', () =>
        HttpResponse.json({
          data: indicesFixture.map((index) =>
            index.code === 'ASPI' ? { ...index, latest: null } : index,
          ),
        }),
      ),
    );

    renderWithProviders(<IndexOverview />);

    expect(await screen.findByText(t('markets.indices.noLatest'))).toBeInTheDocument();
    // SL20 still renders normally alongside the missing ASPI value.
    expect(screen.getByText('4,734.44')).toBeInTheDocument();
  });

  it("reports its own failure without claiming the whole page is down", async () => {
    server.use(
      http.get('*/indices', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'boom', trace_id: 't1' } },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<IndexOverview />);

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});

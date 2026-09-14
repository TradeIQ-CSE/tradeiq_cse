import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { server } from '../../test/server';
import { indicesFixture } from '../../test/fixtures/indices';
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

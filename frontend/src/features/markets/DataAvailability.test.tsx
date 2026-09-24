import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen } from '../../test/render';
import { server } from '../../test/server';
import {
  dataCoverageFixture,
  dataCoverageWithGapFixture,
} from '../../test/fixtures/data-coverage';
import { DataAvailability } from './DataAvailability';

describe('DataAvailability', () => {
  it('states each dataset range, the latest session and every data gap', async () => {
    server.use(
      http.get('*/coverage', () =>
        HttpResponse.json({ data: dataCoverageWithGapFixture }),
      ),
    );

    renderWithProviders(<DataAvailability />);

    expect(
      await screen.findByText('Last updated: Sep 23, 2026'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Jan 2, 2017 – Sep 23, 2026')).toHaveLength(2);
    expect(
      screen.getByText('Data gaps: Jan 1 – Jun 12, 2026 (117 trading days)'),
    ).toBeInTheDocument();
  });

  it('lists no gaps for a dataset that has none', async () => {
    server.use(
      http.get('*/coverage', () =>
        HttpResponse.json({ data: dataCoverageFixture }),
      ),
    );

    renderWithProviders(<DataAvailability />);

    expect(await screen.findByText('Prices')).toBeInTheDocument();
    expect(screen.queryByText(/Data gaps:/)).not.toBeInTheDocument();
  });

  it('renders nothing when coverage fails to load', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.error()));

    const { container } = renderWithProviders(
      <DataAvailability />,
    );

    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(container).toBeEmptyDOMElement();
  });
});

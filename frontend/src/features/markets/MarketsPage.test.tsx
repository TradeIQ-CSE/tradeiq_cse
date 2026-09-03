import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { server } from '../../test/server';
import { securitiesFixture } from '../../test/fixtures/securities';
import { MarketsPage } from './MarketsPage';
import i18n from '../../i18n';

// t() pulled straight from the singleton the app itself uses, so an
// assertion on a translated string can never drift from what the component
// actually renders.
const t = i18n.t.bind(i18n);

function envelope(total: number) {
  return {
    data: securitiesFixture,
    meta: {
      page: 1,
      page_size: 20,
      total,
      as_of: '2026-09-02',
      available_from: '2020-01-02',
      available_to: '2026-09-02',
    },
  };
}

describe('MarketsPage', () => {
  it('renders loaded rows from the securities feed', async () => {
    renderWithProviders(<MarketsPage />);

    for (const security of securitiesFixture) {
      expect(await screen.findByText(security.symbol)).toBeInTheDocument();
      expect(screen.getByText(security.company_name)).toBeInTheDocument();
    }
  });

  it('shows the skeleton state while pending, with no rows and aria-busy on the card', async () => {
    let releaseResponse: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    server.use(
      http.get('*/securities', async () => {
        await gate;
        return HttpResponse.json(envelope(securitiesFixture.length));
      }),
    );

    renderWithProviders(<MarketsPage />);

    // The card is the immediate parent of the loading indicator; reaching it
    // this way avoids querying by CSS class.
    const loadingStatus = await screen.findByRole('status', {
      name: t('markets.states.loading'),
    });
    const card = loadingStatus.parentElement as HTMLElement;
    expect(card).toHaveAttribute('aria-busy', 'true');

    // isPending && !data: no row content yet, only skeleton placeholders.
    for (const security of securitiesFixture) {
      expect(screen.queryByText(security.symbol)).not.toBeInTheDocument();
    }

    releaseResponse();
    expect(await screen.findByText(securitiesFixture[0].symbol)).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-busy', 'false');
  });

  it('shows the empty state when the feed returns no rows', async () => {
    server.use(
      http.get('*/securities', () => {
        return HttpResponse.json({
          data: [],
          meta: { page: 1, page_size: 20, total: 0 },
        });
      }),
    );

    renderWithProviders(<MarketsPage />);

    expect(await screen.findByText(t('markets.states.empty'))).toBeInTheDocument();
  });

  it('shows the ApiError message when the API responds with a structured error', async () => {
    server.use(
      http.get('*/securities', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'internal_error',
              message: 'The market-trading service is temporarily unavailable.',
              trace_id: 'trace-123',
            },
          },
          { status: 500 },
        );
      }),
    );

    renderWithProviders(<MarketsPage />);

    expect(
      await screen.findByText('The market-trading service is temporarily unavailable.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(t('markets.states.unreachable'))).not.toBeInTheDocument();
  });

  it('shows the generic unreachable message when the request fails outside the ApiError shape', async () => {
    server.use(
      http.get('*/securities', () => {
        return HttpResponse.error();
      }),
    );

    renderWithProviders(<MarketsPage />);

    expect(await screen.findByText(t('markets.states.unreachable'))).toBeInTheDocument();
  });

  it('resets the page to 1 when the search box changes', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/securities', () => HttpResponse.json(envelope(45))),
    );

    renderWithProviders(<MarketsPage />);

    await screen.findByText(securitiesFixture[0].symbol);

    const nextButton = screen.getByRole('button', { name: t('markets.pagination.next') });
    await user.click(nextButton);

    await waitFor(() => {
      expect(
        screen.getByText(t('markets.pagination.page', { page: '2', lastPage: '3' })),
      ).toBeInTheDocument();
    });

    const searchBox = screen.getByRole('textbox', { name: t('topbar.searchPlaceholder') });
    await user.type(searchBox, 'JKH');

    await waitFor(() => {
      expect(
        screen.getByText(t('markets.pagination.page', { page: '1', lastPage: '3' })),
      ).toBeInTheDocument();
    });
  });

  it('resets the page to 1 when the sort column changes', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/securities', () => HttpResponse.json(envelope(45))),
    );

    renderWithProviders(<MarketsPage />);

    await screen.findByText(securitiesFixture[0].symbol);

    const nextButton = screen.getByRole('button', { name: t('markets.pagination.next') });
    await user.click(nextButton);

    await waitFor(() => {
      expect(
        screen.getByText(t('markets.pagination.page', { page: '2', lastPage: '3' })),
      ).toBeInTheDocument();
    });

    const sortButton = screen.getByRole('button', { name: t('markets.columns.sector') });
    await user.click(sortButton);

    await waitFor(() => {
      expect(
        screen.getByText(t('markets.pagination.page', { page: '1', lastPage: '3' })),
      ).toBeInTheDocument();
    });
    expect(sortButton).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: t('markets.columns.symbol') }),
    ).toHaveAttribute('aria-current', 'false');
  });

  it('toggles aria-pressed on the watch button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketsPage />);

    await screen.findByText(securitiesFixture[0].symbol);

    // Every row starts unwatched, so the first "add to watchlist" button in
    // document order belongs to the first fixture row.
    const [watchButton] = screen.getAllByRole('button', {
      name: t('markets.watch.add'),
    });

    expect(watchButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(watchButton);

    expect(watchButton).toHaveAttribute('aria-pressed', 'true');
    expect(watchButton).toHaveAccessibleName(t('markets.watch.remove'));

    await user.click(watchButton);

    expect(watchButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps previous rows visible during a page change instead of replacing them with a spinner', async () => {
    const user = userEvent.setup();
    let releasePageTwo: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePageTwo = resolve;
    });

    server.use(
      http.get('*/securities', async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('page') === '2') {
          await gate;
        }
        return HttpResponse.json(envelope(45));
      }),
    );

    renderWithProviders(<MarketsPage />);
    await screen.findByText(securitiesFixture[0].symbol);

    const nextButton = screen.getByRole('button', { name: t('markets.pagination.next') });
    await user.click(nextButton);

    // Page 2's request is still in flight (gated), but placeholderData must
    // keep the old rows on screen rather than swapping to a skeleton.
    expect(screen.getByText(securitiesFixture[0].symbol)).toBeInTheDocument();
    const loadingStatus = screen.getByRole('status', { name: t('markets.states.loading') });
    // Capture the card once, while the status span (its only conditionally
    // rendered child) still exists to reach it through — re-deriving this
    // from loadingStatus.parentElement after the fetch settles would be
    // null, since React detaches that span once isFetching flips to false.
    const card = loadingStatus.parentElement as HTMLElement;
    expect(card).toHaveAttribute('aria-busy', 'true');

    releasePageTwo();

    await waitFor(() => {
      expect(card).toHaveAttribute('aria-busy', 'false');
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

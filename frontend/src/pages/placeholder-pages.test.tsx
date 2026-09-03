import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../test/render';
import { Portfolio } from './investor/Portfolio';
import { Watchlist } from './investor/Watchlist';
import { Orders } from './investor/Orders';
import { Analytics } from './investor/Analytics';
import { AdminHome } from './admin/AdminHome';

// Portfolio, Watchlist, Orders, Analytics and AdminHome are static Ant Design
// shells: no props, no state, no data fetching, and every button rendered
// `disabled`. There is no behaviour here for a test to pin down, so this is a
// smoke test and nothing more — it only proves each page mounts and renders
// its heading. It cannot fail against any plausible wrong implementation
// beyond a typo'd heading or a render crash, and it should be deleted as each
// page gains real behaviour under issue #40.
const pages = [
  { name: 'Portfolio', Component: Portfolio, heading: 'My Portfolio' },
  { name: 'Watchlist', Component: Watchlist, heading: 'Watchlist' },
  { name: 'Orders', Component: Orders, heading: 'Orders & Execution' },
  { name: 'Analytics', Component: Analytics, heading: 'Backtesting & Analytics' },
  { name: 'AdminHome', Component: AdminHome, heading: 'Admin Panel' },
];

describe('placeholder console pages (smoke test only, see #40)', () => {
  it.each(pages)('$name renders its heading without crashing', ({ Component, heading }) => {
    renderWithProviders(<Component />);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });
});

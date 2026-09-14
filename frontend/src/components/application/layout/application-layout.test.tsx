import { RiLineChartLine } from '@remixicon/react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AppNotice,
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
  PageToolbar,
  StatSurface,
} from './application-layout';

describe('application layout primitives', () => {
  it('composes a constrained page with reusable application surfaces', () => {
    render(
      <AppPage width="reading" data-testid="page">
        <PageIntro eyebrow="Market research" title="Browse securities" description="End-of-day CSE data." />
        <PageToolbar aria-label="Filters">Filters</PageToolbar>
        <StatSurface icon={RiLineChartLine} label="Listed securities" value="294" />
        <AppPanel>Market table</AppPanel>
        <AppNotice title="Data timing">Prices are end-of-day.</AppNotice>
      </AppPage>,
    );

    expect(screen.getByTestId('page')).toHaveClass('max-w-4xl');
    expect(screen.getByRole('heading', { name: 'Browse securities' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('294');
    expect(screen.getByRole('note')).toHaveTextContent('Prices are end-of-day.');
  });

  it('exposes loading and failure states to assistive technology', () => {
    const { rerender } = render(<PageState kind="loading" title="Loading portfolio" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading portfolio');

    rerender(<PageState kind="error" title="Portfolio unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Portfolio unavailable');
  });
});

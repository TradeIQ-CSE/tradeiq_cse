import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { getEnvelope } from '../lib/api';
import { securitiesFixture } from './fixtures/securities';
import { renderWithProviders } from './render';

// Proves the harness is wired up, not application behaviour. Stages 2 and 3
// replace/extend this with real coverage.
describe('test harness', () => {
  it('renders through renderWithProviders and jest-dom matchers work', () => {
    renderWithProviders(<div>harness ok</div>);

    expect(screen.getByText('harness ok')).toBeInTheDocument();
  });

  it('intercepts requests through MSW and returns fixture data', async () => {
    const envelope = await getEnvelope<typeof securitiesFixture>('/securities');

    expect(envelope.data).toEqual(securitiesFixture);
  });
});

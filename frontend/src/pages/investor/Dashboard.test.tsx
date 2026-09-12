import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../../test/render';
import { Dashboard } from './Dashboard';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('Dashboard', () => {
  it('renders only API-backed market and paper-portfolio summaries', async () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByRole('heading', { name: t('dashboardPage.title') })).toBeInTheDocument();
    expect(await screen.findByText('LKR 1,018,342.40')).toBeInTheDocument();
    expect(await screen.findByText('HNB.N0000')).toBeInTheDocument();
    expect(screen.getByText(t('dashboardPage.dataNotice'))).toBeInTheDocument();
    expect(screen.queryByText(/candlestick component preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/real-time overview/i)).not.toBeInTheDocument();
  });
});

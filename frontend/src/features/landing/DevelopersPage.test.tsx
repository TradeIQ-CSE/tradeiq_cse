import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/render';
import { DevelopersPage } from './DevelopersPage';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

describe('DevelopersPage', () => {
  it('renders the hero and the three get-started steps', () => {
    renderWithProviders(<DevelopersPage />);

    expect(
      screen.getByRole('heading', { name: t('developers.hero.heading'), level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('developers.hero.facts'))).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: t('developers.start.create.title') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('developers.start.send.title') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('developers.start.read.title') })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: t('developers.start.create.link') })).toHaveAttribute(
      'href',
      '/api-key',
    );
  });

  it('shows the real header on step two', () => {
    renderWithProviders(<DevelopersPage />);
    expect(screen.getByText('X-API-Key: YOUR_KEY')).toBeInTheDocument();
  });

  it('switches the quick-start snippet between curl, Python and JavaScript', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevelopersPage />);

    expect(screen.getByText(/curl "https:\/\/tradeiqcse\.tech/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: t('developers.start.read.tabs.python') }));
    expect(screen.getByText(/import requests/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: t('developers.start.read.tabs.javascript') }));
    expect(screen.getByText(/const response = await fetch/)).toBeInTheDocument();
  });

  it('calls the real, documented path with the real header, never a key-shaped secret', () => {
    const { container } = renderWithProviders(<DevelopersPage />);

    expect(screen.getByText(/securities\/JKH\.N0000\/ohlcv\?timeframe=daily/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/tiq_[A-Za-z0-9]{40}/);
  });

  it('links to the hosted reference, opening in a new tab, from the hero', () => {
    renderWithProviders(<DevelopersPage />);

    const link = screen.getByRole('link', { name: t('developers.hero.reference') });
    expect(link).toHaveAttribute('href', 'https://tradeiqcse.tech/api/public/v1/docs');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not repeat the request limit in its own Limits section', () => {
    renderWithProviders(<DevelopersPage />);

    expect(screen.queryByRole('heading', { name: /limits/i })).not.toBeInTheDocument();
    expect(screen.getByText(t('developers.hero.facts'))).toBeInTheDocument();
  });
});

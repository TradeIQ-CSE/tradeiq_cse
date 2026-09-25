import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../test/render';
import { Analytics } from './investor/Analytics';
import { AdminHome } from './admin/AdminHome';
import { PlannedFeaturePage } from './PlannedFeaturePage';
import i18n from '../i18n';

const t = i18n.t.bind(i18n);

describe('Stage 5 capability pages', () => {
  it('says analytics is coming soon and points at the portfolio instead', () => {
    renderWithProviders(<Analytics />);

    expect(
      screen.getByRole('heading', { name: t('plannedFeatures.analytics.title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('plannedFeatures.comingSoon'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('plannedFeatures.analytics.alternative') }),
    ).toBeEnabled();
  });
});

describe('Stage 6 capability pages', () => {
  it('keeps unsupported admin operations honest and disabled', () => {
    renderWithProviders(<AdminHome />);

    expect(screen.getByRole('heading', { name: t('adminPage.title') })).toBeInTheDocument();
    expect(screen.getByText(t('adminPage.notice'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('adminPage.capabilities.data.action') }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: t('adminPage.capabilities.access.action') }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: t('adminPage.capabilities.diagnostics.action') }),
    ).toBeDisabled();
  });

  it('offers a working alternative instead of invented AI results', () => {
    renderWithProviders(<PlannedFeaturePage feature="aiInsights" />);

    expect(
      screen.getByRole('heading', { name: t('plannedFeatures.aiInsights.title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('plannedFeatures.comingSoon'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('plannedFeatures.aiInsights.alternative') }),
    ).toBeEnabled();
  });
});

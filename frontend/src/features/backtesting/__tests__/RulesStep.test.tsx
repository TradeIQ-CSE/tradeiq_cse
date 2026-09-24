// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { RulesStep } from '../components/RulesStep';
import { BacktestWizardProvider } from '../context/BacktestContext';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { BacktestConfig, SellCondition } from '../domain/types';
import { createTestAuthContext, createTestQueryClient } from '../../../test/render';
import { AuthContext } from '../../../auth/useAuth';

const TestConsumer: React.FC<{ onConfigChange?: (config: BacktestConfig) => void }> = ({ onConfigChange }) => {
  const { config } = useBacktestWizard();
  React.useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  return <RulesStep />;
};

// BacktestWizardProvider reads price gaps via useDataCoverage (React Query),
// so every render needs a QueryClientProvider now — see the /coverage
// handler default (no gaps) in test/handlers.ts. It also reads the auth
// status to choose between a saved run and a preview.
function renderRulesStep(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AuthContext.Provider value={createTestAuthContext()}>
        <MemoryRouter initialEntries={['/backtests/new/rules']}>
          <BacktestWizardProvider>{ui}</BacktestWizardProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('RulesStep Event & Toggle Behavior', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles an unselected sell rule (Target Exit Price) on click without creating duplicate entries', () => {
    let latestConfig: BacktestConfig | null = null;

    renderRulesStep(<TestConsumer onConfigChange={(c) => (latestConfig = c)} />);

    // Target Exit Price card starts unselected
    const targetPriceCard = screen.getByRole('checkbox', { name: /Target Exit Price/i });
    expect(targetPriceCard).toBeTruthy();

    const getTargetPriceSells = () =>
      latestConfig?.rules?.sells?.filter((s: SellCondition) => s.type === 'target_price') || [];

    expect(getTargetPriceSells().length).toBe(0);

    // Click to select
    fireEvent.click(targetPriceCard);
    expect(getTargetPriceSells().length).toBe(1);

    // Click again to deselect
    fireEvent.click(targetPriceCard);
    expect(getTargetPriceSells().length).toBe(0);
  });

  it('handles the standard keyboard Space interaction without double toggling', async () => {
    let latestConfig: BacktestConfig | null = null;

    renderRulesStep(<TestConsumer onConfigChange={(c) => (latestConfig = c)} />);

    const targetPriceCard = screen.getByRole('checkbox', { name: /Target Exit Price/i });
    const user = userEvent.setup({ delay: null });

    const getTargetPriceSells = () =>
      latestConfig?.rules?.sells?.filter((s: SellCondition) => s.type === 'target_price') || [];

    targetPriceCard.focus();
    await user.keyboard('[Space]');
    expect(getTargetPriceSells().length).toBe(1);

    await user.keyboard('[Space]');
    expect(getTargetPriceSells().length).toBe(0);
  });
});

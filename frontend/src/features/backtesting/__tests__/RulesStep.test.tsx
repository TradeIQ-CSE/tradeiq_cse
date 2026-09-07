// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RulesStep } from '../components/RulesStep';
import { BacktestWizardProvider } from '../context/BacktestContext';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { BacktestConfig, SellCondition } from '../domain/types';

const TestConsumer: React.FC<{ onConfigChange?: (config: BacktestConfig) => void }> = ({ onConfigChange }) => {
  const { config } = useBacktestWizard();
  React.useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  return <RulesStep />;
};

describe('RulesStep Event & Toggle Behavior', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles an unselected sell rule (Target Exit Price) on click without creating duplicate entries', () => {
    let latestConfig: BacktestConfig | null = null;

    render(
      <MemoryRouter initialEntries={['/backtests/new/rules']}>
        <BacktestWizardProvider>
          <TestConsumer onConfigChange={(c) => (latestConfig = c)} />
        </BacktestWizardProvider>
      </MemoryRouter>,
    );

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

  it('handles keyboard Space and Enter keys on card container without double toggling', () => {
    let latestConfig: BacktestConfig | null = null;

    render(
      <MemoryRouter initialEntries={['/backtests/new/rules']}>
        <BacktestWizardProvider>
          <TestConsumer onConfigChange={(c) => (latestConfig = c)} />
        </BacktestWizardProvider>
      </MemoryRouter>,
    );

    const targetPriceCard = screen.getByRole('checkbox', { name: /Target Exit Price/i });

    const getTargetPriceSells = () =>
      latestConfig?.rules?.sells?.filter((s: SellCondition) => s.type === 'target_price') || [];

    // Press Space on card container
    fireEvent.keyDown(targetPriceCard, { key: ' ' });
    expect(getTargetPriceSells().length).toBe(1);

    // Press Enter on card container to deselect
    fireEvent.keyDown(targetPriceCard, { key: 'Enter' });
    expect(getTargetPriceSells().length).toBe(0);
  });
});

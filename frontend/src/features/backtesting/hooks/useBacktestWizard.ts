import { useContext } from 'react';
import { BacktestContext, BacktestContextValue } from '../context/BacktestContext';

export function useBacktestWizard(): BacktestContextValue {
  const ctx = useContext(BacktestContext);
  if (!ctx) {
    throw new Error('useBacktestWizard must be used within a BacktestWizardProvider');
  }
  return ctx;
}

export { BacktestWizardProvider } from '../context/BacktestContext';
export type { BacktestContextValue } from '../context/BacktestContext';

import type { ConfigurationCatalog, PredictionBatch, SavedPrediction } from '../../features/ai-insights/types';

export const predictionCatalog: ConfigurationCatalog = {
  default_config_key: 'pt0.015_sl0.0075_H36_T30',
  configurations: [0.01, 0.015, 0.02].flatMap((take_profit_pct) =>
    [0.005, 0.0075, 0.01].flatMap((stop_loss_pct) =>
      [24, 36, 48].map((horizon_bars) => ({
        config_key: `pt${take_profit_pct}_sl${stop_loss_pct}_H${horizon_bars}_T30`,
        take_profit_pct, stop_loss_pct, horizon_bars, test_days: 30,
      })),
    ),
  ),
};

export const predictionBatch: PredictionBatch = {
  run_id: '00000000-0000-4000-8000-000000000001', status: 'partial',
  started_at: '2026-10-08T03:00:00Z', completed_at: '2026-10-08T04:00:00Z',
  data_as_of: '2026-10-07', symbols_requested: 288,
  models_trained: 7560, models_skipped: 216, models_failed: 0,
};

export function savedPrediction(overrides: Partial<SavedPrediction> = {}): SavedPrediction {
  return {
    prediction_id: '00000000-0000-4000-8000-000000000002', symbol: 'COMB.N0000',
    configuration: predictionCatalog.configurations.find((setup) => setup.config_key === predictionCatalog.default_config_key)!,
    prob_long: 0.4813, is_long_signal: false, confidence_margin: 0.3,
    data_as_of: '2026-10-07', generated_at: predictionBatch.completed_at!, model_version: '1.0.0',
    batch: predictionBatch, ...overrides,
  };
}

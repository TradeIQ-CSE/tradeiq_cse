// docs/api/ml-predictions-v1.md. Percentages in the API are fractions.
export interface PredictionSetup {
  config_key: string;
  take_profit_pct: number;
  stop_loss_pct: number;
  horizon_bars: number;
  test_days: number;
}

export interface ConfigurationCatalog {
  configurations: PredictionSetup[];
  default_config_key: string | null;
}

export interface PredictionBatch {
  run_id: string;
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  started_at: string;
  completed_at: string | null;
  data_as_of: string | null;
  symbols_requested: number;
  models_trained: number;
  models_skipped: number;
  models_failed: number;
}

export interface SavedPrediction {
  prediction_id: string;
  symbol: string;
  configuration: PredictionSetup;
  prob_long: number;
  is_long_signal: boolean;
  confidence_margin: number;
  data_as_of: string;
  generated_at: string;
  model_version: string;
  batch: PredictionBatch;
}

export interface PredictionResponse {
  symbol: string;
  config_key: string | null;
  availability: 'available' | 'no_prediction' | 'no_completed_batch';
  prediction: SavedPrediction | null;
}

export interface PredictionStatus {
  latest_run: PredictionBatch | null;
  latest_completed_run: PredictionBatch | null;
}

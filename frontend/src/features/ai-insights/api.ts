import { authedGet } from '../../lib/authed-api';
import type { ConfigurationCatalog, PredictionResponse, PredictionStatus } from './types';

export const ML_PREDICTION_API_URL =
  import.meta.env.VITE_ML_PREDICTION_API_URL || 'http://localhost:8001';

export async function getConfigurations(): Promise<ConfigurationCatalog> {
  return (await authedGet<ConfigurationCatalog>('/predictions/configurations', undefined, ML_PREDICTION_API_URL)).data;
}

export async function getPrediction(symbol: string, configKey: string): Promise<PredictionResponse> {
  return (await authedGet<PredictionResponse>(
    `/predictions/${encodeURIComponent(symbol)}`,
    { config_key: configKey },
    ML_PREDICTION_API_URL,
  )).data;
}

export async function getPredictionStatus(): Promise<PredictionStatus> {
  return (await authedGet<PredictionStatus>('/predictions/status', undefined, ML_PREDICTION_API_URL)).data;
}

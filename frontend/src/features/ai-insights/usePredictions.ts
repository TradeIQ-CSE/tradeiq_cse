import { useQuery } from '@tanstack/react-query';
import { getConfigurations, getPrediction, getPredictionStatus } from './api';

// Results update after a scheduled batch; browsing never starts that job.
const STALE_TIME = 5 * 60 * 1000;

export function useConfigurations() {
  return useQuery({ queryKey: ['ml', 'configurations'], queryFn: getConfigurations, staleTime: STALE_TIME });
}

export function usePredictionStatus() {
  return useQuery({ queryKey: ['ml', 'status'], queryFn: getPredictionStatus, staleTime: STALE_TIME });
}

export function usePrediction(symbol: string, configKey: string | undefined) {
  return useQuery({
    queryKey: ['ml', 'prediction', symbol, configKey],
    queryFn: () => getPrediction(symbol, configKey!),
    enabled: !!symbol && !!configKey,
    staleTime: STALE_TIME,
    // A new company or setup must never inherit the previous result.
  });
}

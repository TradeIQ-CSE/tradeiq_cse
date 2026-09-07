import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import {
  OhlcvRange,
  OhlcvResponse,
  OhlcvTimeframe,
  SecurityDetail,
} from './types';

function querySymbol(symbol: string): string {
  return symbol.trim().toLocaleUpperCase('en-US');
}

function encodedSymbol(symbol: string): string {
  return encodeURIComponent(symbol.trim());
}

export const securityQueryKeys = {
  detail: (symbol: string) => ['security-detail', querySymbol(symbol)] as const,
  ohlcv: (symbol: string, timeframe: OhlcvTimeframe, range: OhlcvRange = {}) =>
    [
      'security-ohlcv',
      querySymbol(symbol),
      timeframe,
      range.from ?? null,
      range.to ?? null,
    ] as const,
};

export function useSecurityDetail(symbol: string) {
  return useQuery({
    queryKey: securityQueryKeys.detail(symbol),
    queryFn: async () => {
      const response = await getEnvelope<SecurityDetail>(
        `/securities/${encodedSymbol(symbol)}`,
      );
      return response.data;
    },
    enabled: symbol.trim().length > 0,
  });
}

export function useSecurityOhlcv(
  symbol: string,
  timeframe: OhlcvTimeframe,
  range: OhlcvRange = {},
  enabled = true,
) {
  return useQuery({
    queryKey: securityQueryKeys.ohlcv(symbol, timeframe, range),
    queryFn: async () => {
      const response = await getEnvelope<OhlcvResponse>(
        `/securities/${encodedSymbol(symbol)}/ohlcv`,
        {
          timeframe,
          from: range.from,
          to: range.to,
        },
      );
      return response.data;
    },
    enabled: enabled && symbol.trim().length > 0,
  });
}

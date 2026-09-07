import { BacktestConfig, CreateBacktestRunRequest } from './types';

/**
 * Maps the frontend BacktestConfig object into the exact JSON schema
 * expected by the backend CreateBacktestRunDto API contract.
 */
export function mapToBacktestRequest(config: BacktestConfig): CreateBacktestRunRequest {
  const buyValue =
    config.rules.buy.type === 'period_start' ? undefined : config.rules.buy.value;

  const sellRules = config.rules.sells.map((sell) => ({
    type: sell.type,
    ...(sell.type === 'end_of_period' ? {} : { value: sell.value }),
  }));

  const request: CreateBacktestRunRequest = {
    symbol: config.security.symbol.trim(),
    startDate: config.period.startDate.trim(),
    endDate: config.period.endDate.trim(),
    startingCapital: Number(config.portfolio.startingCapital),
    rule: {
      buy: {
        type: config.rules.buy.type,
        ...(buyValue !== undefined ? { value: Number(buyValue) } : {}),
      },
      sell: sellRules,
    },
    feeConfig: {
      brokerageRate: Number(config.execution.fees.brokerageRate),
      cseRate: Number(config.execution.fees.cseRate),
      cdsRate: Number(config.execution.fees.cdsRate),
      secCessRate: Number(config.execution.fees.secCessRate),
      stlRate: Number(config.execution.fees.stlRate),
    },
    positionSizing: {
      type: config.execution.positionSizing.type,
      ...(config.execution.positionSizing.value !== undefined
        ? { value: Number(config.execution.positionSizing.value) }
        : {}),
    },
    warmupPeriod: config.execution.warmupPeriod ?? 0,
  };

  return request;
}

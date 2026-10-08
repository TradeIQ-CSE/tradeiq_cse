import { FeeConfig, FeeBreakdown, PositionSizingConfig } from '../domain/types';
import { InvalidRuleError } from '../domain/errors';
import { round4 } from '../domain/rounding';

export interface TransactionDetails {
  grossValue: number;
  fees: FeeBreakdown;
  cashFlow: number;
}

export interface CalculateBuyQuantityParams {
  currentCash: number;
  initialCapital: number;
  executionPrice: number;
  positionSizing: PositionSizingConfig;
  feeConfig: FeeConfig;
  isVersion2: boolean;
}

export interface BuyPositionExecution {
  quantity: number;
  transaction: TransactionDetails;
}

/**
 * Sums all configured fee rates (brokerage, cse, cds, secCess, stl).
 */
export function calculateFeeRate(feeConfig: FeeConfig): number {
  return (
    feeConfig.brokerageRate +
    feeConfig.cseRate +
    feeConfig.cdsRate +
    feeConfig.secCessRate +
    feeConfig.stlRate
  );
}

/**
 * Calculates gross value, itemized breakdown fees, fee rounding residue adjustments (V2),
 * and net cash flow for BUY or SELL transactions.
 */
export function calculateTransactionDetails(
  quantity: number,
  executionPrice: number,
  tradeType: 'BUY' | 'SELL',
  feeConfig: FeeConfig,
  isVersion2: boolean,
): TransactionDetails {
  const grossValue = round4(quantity * executionPrice);

  const fees: FeeBreakdown = {
    brokerage: round4(grossValue * feeConfig.brokerageRate),
    cse: round4(grossValue * feeConfig.cseRate),
    cds: round4(grossValue * feeConfig.cdsRate),
    secCess: round4(grossValue * feeConfig.secCessRate),
    stl: round4(grossValue * feeConfig.stlRate),
    total: 0,
  };

  fees.total = round4(
    fees.brokerage + fees.cse + fees.cds + fees.secCess + fees.stl,
  );

  // V2 fee rounding adjustment: removes excess rounding units when total fees exceed gross
  if (isVersion2 && fees.total > grossValue) {
    let residue = Math.round((fees.total - grossValue) * 10_000);
    const components = ['stl', 'secCess', 'cds', 'cse', 'brokerage'] as const;
    for (const component of components) {
      const units = Math.round(fees[component] * 10_000);
      const reduction = Math.min(units, residue);
      fees[component] = round4((units - reduction) / 10_000);
      residue -= reduction;
      if (residue === 0) break;
    }
    fees.total = round4(
      fees.brokerage + fees.cse + fees.cds + fees.secCess + fees.stl,
    );
  }

  const cashFlow =
    tradeType === 'BUY'
      ? round4(-(grossValue + fees.total))
      : round4(grossValue - fees.total);

  return {
    grossValue,
    fees,
    cashFlow,
  };
}

/**
 * Calculates the maximum cash allocation for a BUY order based on position sizing rules.
 */
export function calculateMaxBuyAllocation(
  currentCash: number,
  initialCapital: number,
  positionSizing: PositionSizingConfig,
  isVersion2: boolean,
): number {
  if (positionSizing.type === 'percentage') {
    const baseCapital = isVersion2 ? currentCash : initialCapital;
    const percentage = positionSizing.value ?? 100;
    return Math.min(currentCash, round4(baseCapital * (percentage / 100)));
  }
  if (positionSizing.type === 'absolute') {
    return Math.min(currentCash, positionSizing.value ?? 0);
  }
  return currentCash;
}

/**
 * Computes affordable buy quantity and transaction details, iteratively trimming quantity
 * to ensure cash balance or allocation constraints are satisfied.
 */
export function calculateBuyPositionExecution(
  params: CalculateBuyQuantityParams,
): BuyPositionExecution {
  const {
    currentCash,
    initialCapital,
    executionPrice,
    positionSizing,
    feeConfig,
    isVersion2,
  } = params;

  const maxAllocation = calculateMaxBuyAllocation(
    currentCash,
    initialCapital,
    positionSizing,
    isVersion2,
  );

  const totalFeeRate = calculateFeeRate(feeConfig);
  const affordableQuantity = Math.floor(
    maxAllocation / (executionPrice * (1 + totalFeeRate)),
  );

  let initialQuantity =
    positionSizing.type === 'fixed_quantity'
      ? Math.floor(positionSizing.value ?? 0)
      : affordableQuantity;

  if (positionSizing.type === 'fixed_quantity') {
    // Keep one extra share for the rounded affordability check below.
    initialQuantity = Math.min(initialQuantity, affordableQuantity + 1);
  }

  if (isVersion2 && !Number.isSafeInteger(initialQuantity)) {
    throw new InvalidRuleError(
      'Position quantity exceeds the supported whole-share range.',
    );
  }

  let quantity = initialQuantity;
  let transaction = calculateTransactionDetails(
    quantity,
    executionPrice,
    'BUY',
    feeConfig,
    isVersion2,
  );

  const cashLimit = isVersion2 ? maxAllocation : currentCash;
  while (quantity > 0 && -transaction.cashFlow > cashLimit) {
    quantity--;
    transaction = calculateTransactionDetails(
      quantity,
      executionPrice,
      'BUY',
      feeConfig,
      isVersion2,
    );
  }

  return { quantity, transaction };
}

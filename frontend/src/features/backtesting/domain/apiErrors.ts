import type { StepKey } from './types';

/** Normalize DTO fields and the legacy engine's details array to wizard fields. */
export function backtestApiValidationFields(fields: unknown, details: unknown): Array<{ field: string; reason: string; step: StepKey }> {
  const source = Array.isArray(fields) ? fields : Array.isArray(details) ? details : [];
  return source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object' || !('field' in item) || !('reason' in item) || typeof item.field !== 'string' || typeof item.reason !== 'string') return [];
    const raw = item.field.replace(/^rule\./, '');
    let field = raw;
    let step: StepKey = 'review';
    if (raw.startsWith('reentry') || raw === 'version') { step = 'rules'; field = raw === 'version' ? 'version' : 'reentry.value'; }
    else if (/^(buy|sell)/.test(raw)) { step = 'rules'; field = raw.replace(/^buyCondition/, 'buy').replace(/^sellConditions/, 'sells').replace(/^sell(?=\[|$)/, 'sells'); }
    else if (raw.includes('symbol')) step = 'security';
    else if (raw.includes('Date')) step = 'period';
    else if (raw.includes('fee') || raw.includes('positionSizing')) { step = 'execution'; field = raw === 'feeConfig' ? 'fees.brokerageRate' : raw.replace(/^feeConfig\./, 'fees.'); }
    else if (raw.includes('Capital')) { step = 'portfolio'; field = 'startingCapital'; }
    return [{ field, reason: item.reason, step }];
  });
}

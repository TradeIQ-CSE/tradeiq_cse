import type { StepKey } from './types';

export type WorkflowMode = 'simple' | 'advanced';
export const ADVANCED_STEPS: StepKey[] = ['security', 'period', 'rules', 'execution', 'portfolio', 'metrics', 'review'];
export const SIMPLE_STEPS: StepKey[] = ['security', 'rules', 'review'];

export function simplePageFor(step: StepKey): StepKey {
  if (step === 'security' || step === 'period') return 'security';
  if (step === 'metrics' || step === 'review') return 'review';
  return 'rules';
}

export function sectionsForPage(mode: WorkflowMode, step: StepKey): StepKey[] {
  if (mode === 'advanced') return [step];
  return ADVANCED_STEPS.filter((section) => simplePageFor(section) === simplePageFor(step));
}

export function workflowLocation(mode: WorkflowMode, step: StepKey, openSection = false) {
  const page = mode === 'simple' ? simplePageFor(step) : step;
  return `/backtests/new/${page}?mode=${mode}${mode === 'simple' && openSection ? `#${step}` : ''}`;
}

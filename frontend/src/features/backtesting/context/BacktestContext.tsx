import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  BacktestConfig,
  StepKey,
  ValidationError,
  CreateBacktestRunResponse,
  SecuritySelection,
} from '../domain/types';
import { createFreshBacktestDraft, restoreBacktestDraft, selectDraftSecurity, updateBacktestDraft } from '../domain/draft';
import { validateBacktestConfig } from '../domain/validation';
import { mapToBacktestRequest } from '../domain/mapper';
import { previewBacktestRun, submitBacktestRun } from '../api/backtestApi';
import { storeBacktestPreview } from '../domain/preview';
import { useAuth } from '../../../auth/useAuth';
import { ApiError } from '../../../lib/api';
import { backtestDateGap, DataGap } from '../../../lib/data-gaps';
import { useDataCoverage } from '../../markets/useDataCoverage';
import { ADVANCED_STEPS, SIMPLE_STEPS, simplePageFor, sectionsForPage, workflowLocation, type WorkflowMode } from '../domain/workflow';

import { useBacktestPolicy } from '../hooks/useBacktestPolicy';

const STORAGE_KEY = 'tradeiq_backtest_draft_v1';

export interface BacktestContextValue {
  config: BacktestConfig;
  maxDate: string;
  policyIsFallback: boolean;
  /** The selected security's price gaps (from `useDataCoverage`), so a
   * component doesn't have to fetch coverage a second time to grey out a
   * date, snap a preset or show the crossing notice. Empty until coverage
   * loads, and stays empty (never blocks the wizard) if it fails — the API
   * still guards a submission either way. */
  priceGaps: DataGap[];
  mode: WorkflowMode;
  setMode: (mode: WorkflowMode) => void;
  currentStep: StepKey;
  stepIndex: number;
  totalSteps: number;
  allSteps: StepKey[];
  validationErrors: ValidationError[];
  isSubmitting: boolean;
  submitError: string | null;
  submitTraceId: string | null;
  submitFieldErrors: Array<{ field: string; reason: string }> | null;
  runId: string | null;
  updateConfig: (patch: Partial<BacktestConfig> | ((prev: BacktestConfig) => BacktestConfig)) => void;
  selectSecurity: (security: SecuritySelection) => void;
  goToStep: (step: StepKey, openSection?: boolean) => void;
  goNext: () => boolean;
  goBack: () => void;
  validateCurrentStep: () => boolean;
  validateAllSteps: () => boolean;
  getStepErrors: (step: StepKey) => ValidationError[];
  submitBacktest: () => Promise<CreateBacktestRunResponse | null>;
  resetConfig: () => void;
}

interface StoredValidationError extends ValidationError {
  source?: 'api';
  inputKey?: string;
  policyAtResponse?: string;
  cutoff?: string;
  coverageAtResponse?: number;
}

function mergeErrors(errors: ValidationError[]) {
  return errors.filter((error, index) => errors.findIndex((candidate) => candidate.step === error.step && candidate.field === error.field && (error.step === 'period' || candidate.message === error.message)) === index);
}

const BacktestContext = createContext<BacktestContextValue | null>(null);

function loadInitialDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      return restoreBacktestDraft(JSON.parse(raw));
    }
  } catch {
    // Fall back to defaults on parse/storage error
  }
  return createFreshBacktestDraft();
}

export const BacktestWizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status: authStatus } = useAuth();
  const params = useParams<{ step?: string; runId?: string }>();

  const [draft, setDraft] = useState(loadInitialDraft);
  const config = draft.config;
  // A single fetch shared by every step (React Query dedupes identical
  // queryKeys), not just PeriodStep — presets, the default period and
  // validation all need the same gap list. Memoised so its identity only
  // changes when the query's own data does, not on every render — several
  // callbacks below depend on it.
  const policy = useBacktestPolicy();
  const maxDate = policy.maxDate;
  const refreshPolicy = policy.refetch;
  const coverageQuery = useDataCoverage();
  const coverageGaps = coverageQuery.data?.prices.gaps;
  const priceGaps = useMemo(() => coverageGaps ?? [], [coverageGaps]);
  const [storedValidationErrors, setValidationErrors] = useState<StoredValidationError[]>([]);
  const [periodValidated, setPeriodValidated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submissionPending = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitTraceId, setSubmitTraceId] = useState<string | null>(null);
  const [submitFieldErrors, setSubmitFieldErrors] = useState<Array<{ field: string; reason: string }> | null>(null);
  const [runId, setRunId] = useState<string | null>(params.runId || null);

  // Sync to session storage whenever config changes to preserve across refresh
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, periodUsesCoverageDefault: draft.periodUsesCoverageDefault }));
    } catch {
      // Ignore quota/access errors
    }
  }, [config, draft.periodUsesCoverageDefault]);

  // Mode is URL-owned so reload and browser history preserve the presentation.
  // Explicit legacy step URLs without a mode continue to mean Advanced.
  const mode: WorkflowMode = new URLSearchParams(location.search).get('mode') === 'simple' ? 'simple' : 'advanced';
  const allSteps = mode === 'simple' ? SIMPLE_STEPS : ADVANCED_STEPS;
  const currentStep: StepKey = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    // Path pattern: /backtests/new/:step
    const last = segments[segments.length - 1] as StepKey;
    if (ADVANCED_STEPS.includes(last)) {
      return mode === 'simple' ? simplePageFor(last) : last;
    }
    return 'security';
  }, [location.pathname, mode]);

  const stepIndex = allSteps.indexOf(currentStep);
  const setMode = useCallback((nextMode: WorkflowMode) => {
    if (submissionPending.current || nextMode === mode) return;
    navigate(workflowLocation(nextMode, currentStep));
  }, [navigate, currentStep, mode]);

  const updateConfig = useCallback(
    (patch: Partial<BacktestConfig> | ((prev: BacktestConfig) => BacktestConfig)) => {
      setDraft((previous) => updateBacktestDraft(previous, patch));
      // Clear submit errors when modifying inputs
      setSubmitError(null);
      setSubmitFieldErrors(null);
    },
    [],
  );

  const selectSecurity = useCallback((security: SecuritySelection) => {
    setDraft((previous) => selectDraftSecurity(previous, security, priceGaps, maxDate));
    setSubmitError(null);
    setSubmitFieldErrors(null);
  }, [priceGaps, maxDate]);

  // A security picked before coverage loaded got a default period computed
  // with no gaps. Recompute it once the gaps arrive, unless the reader has
  // already set their own dates.
  useEffect(() => {
    setDraft((previous) =>
      previous.periodUsesCoverageDefault && previous.config.security.symbol
        ? selectDraftSecurity(previous, previous.config.security, priceGaps, maxDate)
        : previous,
    );
  }, [priceGaps, maxDate]);

  const periodInputKey = JSON.stringify([config.security.symbol, config.period.startDate, config.period.endDate]);
  const livePeriodErrors = useMemo(() => validateBacktestConfig(config, 'period', priceGaps, maxDate).errors, [config, priceGaps, maxDate]);
  const apiPeriodErrorApplies = useCallback((error: StoredValidationError) => {
    if (error.step !== 'period' || error.source !== 'api') return true;
    if (error.inputKey !== periodInputKey) return false;
    const date = error.field === 'endDate' ? config.period.endDate : config.period.startDate;
    if (error.cutoff && error.policyAtResponse !== maxDate && date <= maxDate) return false;
    if (error.coverageAtResponse && coverageQuery.dataUpdatedAt > error.coverageAtResponse && !backtestDateGap(priceGaps, date, error.field === 'endDate' ? 'end' : 'start')) return false;
    return true;
  }, [periodInputKey, config.period, maxDate, coverageQuery.dataUpdatedAt, priceGaps]);
  useEffect(() => {
    setValidationErrors((previous) => {
      const retained = previous.filter(apiPeriodErrorApplies).map((error) => error.coverageAtResponse === 0 && coverageQuery.dataUpdatedAt > 0 ? { ...error, coverageAtResponse: coverageQuery.dataUpdatedAt } : error);
      return retained.length === previous.length && retained.every((error, index) => error === previous[index]) ? previous : retained;
    });
  }, [apiPeriodErrorApplies, coverageQuery.dataUpdatedAt]);
  const validationErrors = useMemo(() => {
    const retained = storedValidationErrors.filter((error) => error.step !== 'period' || (error.source === 'api' && apiPeriodErrorApplies(error)));
    return mergeErrors([...retained, ...(periodValidated ? livePeriodErrors : [])]);
  }, [storedValidationErrors, apiPeriodErrorApplies, periodValidated, livePeriodErrors]);
  const getStepErrors = useCallback(
    (step: StepKey) => mergeErrors([...validationErrors.filter((error) => error.step === step), ...(step === 'period' ? livePeriodErrors : [])]),
    [validationErrors, livePeriodErrors],
  );

  const validateCurrentStep = useCallback(() => {
    const sections = sectionsForPage(mode, currentStep);
    if (sections.includes('period')) setPeriodValidated(true);
    const errors = sections.flatMap((step) => validateBacktestConfig(config, step, priceGaps, maxDate).errors);
    setValidationErrors((prev) => {
      const otherErrors = prev.filter((e) => !sections.includes(e.step) || (e.source === 'api' && e.step === 'period' && apiPeriodErrorApplies(e)));
      return [...otherErrors, ...errors];
    });
    return errors.length === 0 && !storedValidationErrors.some((error) => error.step === 'period' && error.source === 'api' && sections.includes(error.step) && apiPeriodErrorApplies(error));
  }, [config, currentStep, mode, priceGaps, maxDate, apiPeriodErrorApplies, storedValidationErrors]);

  const validateAllSteps = useCallback(() => {
    setPeriodValidated(true);
    const result = validateBacktestConfig(config, undefined, priceGaps, maxDate);
    setValidationErrors((previous) => [...previous.filter((error) => error.step === 'period' && error.source === 'api' && apiPeriodErrorApplies(error)), ...result.errors]);
    return result.isValid && !storedValidationErrors.some((error) => error.step === 'period' && error.source === 'api' && apiPeriodErrorApplies(error));
  }, [config, priceGaps, maxDate, apiPeriodErrorApplies, storedValidationErrors]);

  const goToStep = useCallback(
    (step: StepKey, openSection = true) => {
      if (submissionPending.current) return;
      navigate(workflowLocation(mode, step, openSection));
    },
    [navigate, mode],
  );

  const goNext = useCallback(() => {
    if (submissionPending.current) return false;
    const isStepValid = validateCurrentStep();
    if (!isStepValid) {
      return false;
    }

    if (stepIndex < allSteps.length - 1) {
      const nextStep = allSteps[stepIndex + 1];
      navigate(workflowLocation(mode, nextStep));
      return true;
    }
    return true;
  }, [stepIndex, validateCurrentStep, navigate, allSteps, mode]);

  const goBack = useCallback(() => {
    if (submissionPending.current) return;
    // Preserve all entered values; do not clear inputs or reset config
    if (stepIndex > 0) {
      const prevStep = allSteps[stepIndex - 1];
      navigate(workflowLocation(mode, prevStep));
    } else {
      navigate('/markets');
    }
  }, [stepIndex, navigate, allSteps, mode]);

  const submitBacktest = useCallback(async (): Promise<CreateBacktestRunResponse | null> => {
    // Guard against duplicate submission while request is in progress
    if (submissionPending.current) {
      return null;
    }

    // Comprehensive client-side validation check
    setPeriodValidated(true);
    const validation = validateBacktestConfig(config, undefined, priceGaps, maxDate);
    setValidationErrors(validation.errors);

    if (!validation.isValid) {
      setSubmitError('Please fix the validation issues before running the backtest.');
      return null;
    }

    submissionPending.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitTraceId(null);
    setSubmitFieldErrors(null);

    try {
      const dto = mapToBacktestRequest(config);

      // No account: run it as a preview. The results come back in the
      // response and nothing is stored, so the visitor sees them straight
      // away and is asked to sign in only if they want to keep them.
      if (authStatus !== 'authenticated') {
        const results = await previewBacktestRun(dto);
        const record = { config, results, ranAt: new Date().toISOString() };
        storeBacktestPreview(record);
        navigate('/backtests/preview', { state: { preview: record, justRan: true } });
        return null;
      }

      const response = await submitBacktestRun(dto);

      setRunId(response.id);
      // Navigate to status page using returned run identifier
      navigate(`/backtests/${response.id}/status`, { state: { justRan: true } });
      return response;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSubmitError(err.body.message || 'Backtest submission failed.');
        setSubmitTraceId(err.body.trace_id || null);
        setSubmitFieldErrors(err.body.fields || null);

        // DATE_IN_DATA_GAP (docs/plans/data-gap-handling.md §2) carries its
        // gap bounds under `details`, not `fields` — the calendar and
        // client-side validation are meant to catch this first, so seeing it
        // here at all means coverage changed between load and submit.
        // Surface it exactly like any other period error: on the field the
        // API named, with the API's own message.
        if (err.body.code === 'DATE_IN_DATA_GAP' || (err.body.code === 'INVALID_DATE_RANGE' && err.body.details?.maxDate)) {
          if (err.body.code === 'INVALID_DATE_RANGE') void refreshPolicy();
          const field = (err.body.details as { field?: string } | undefined)?.field;
          setValidationErrors((prev) => [
            ...prev,
            {
              step: 'period',
              field: field === 'endDate' ? 'endDate' : 'startDate',
              message: err.body.message,
              source: 'api',
              inputKey: periodInputKey,
              policyAtResponse: maxDate,
              cutoff: err.body.code === 'INVALID_DATE_RANGE' ? String(err.body.details?.maxDate) : undefined,
              coverageAtResponse: err.body.code === 'DATE_IN_DATA_GAP' ? coverageQuery.dataUpdatedAt : undefined,
            },
          ]);
        }

        // Map backend validation field errors to UI steps
        if (err.body.fields && err.body.fields.length > 0) {
          const apiValidationErrors: StoredValidationError[] = err.body.fields.map((f) => {
            let step: StepKey = 'review';
            if (f.field.includes('symbol')) step = 'security';
            else if (f.field.includes('Date')) step = 'period';
            else if (f.field.includes('rule')) step = 'rules';
            else if (f.field.includes('fee') || f.field.includes('positionSizing')) step = 'execution';
            else if (f.field.includes('Capital')) step = 'portfolio';

            return {
              step,
              field: f.field,
              message: f.reason,
              source: 'api',
              inputKey: periodInputKey,
            };
          });

          setValidationErrors((prev) => [...prev, ...apiValidationErrors]);
        }
      } else {
        const error = err as Error;
        setSubmitError(error?.message || 'A network error occurred while submitting the backtest. Your configuration has been preserved.');
      }
      return null;
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }, [authStatus, config, navigate, priceGaps, maxDate, refreshPolicy, periodInputKey, coverageQuery.dataUpdatedAt]);

  const resetConfig = useCallback(() => {
    if (submissionPending.current) return;
    setDraft(createFreshBacktestDraft(maxDate));
    setValidationErrors([]);
    setPeriodValidated(false);
    setSubmitError(null);
    setSubmitFieldErrors(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    navigate(workflowLocation(mode, 'security'));
  }, [navigate, mode, maxDate]);

  const value: BacktestContextValue = {
    config,
    maxDate,
    policyIsFallback: policy.isFallback,
    priceGaps,
    mode,
    setMode,
    currentStep,
    stepIndex,
    totalSteps: allSteps.length,
    allSteps,
    validationErrors,
    isSubmitting,
    submitError,
    submitTraceId,
    submitFieldErrors,
    runId,
    updateConfig,
    selectSecurity,
    goToStep,
    goNext,
    goBack,
    validateCurrentStep,
    validateAllSteps,
    getStepErrors,
    submitBacktest,
    resetConfig,
  };

  return <BacktestContext.Provider value={value}>{children}</BacktestContext.Provider>;
};

export { BacktestContext };

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
import { submitBacktestRun } from '../api/backtestApi';
import { ApiError } from '../../../lib/api';
import { ADVANCED_STEPS, SIMPLE_STEPS, simplePageFor, sectionsForPage, workflowLocation, type WorkflowMode } from '../domain/workflow';

const STORAGE_KEY = 'tradeiq_backtest_draft_v1';

export interface BacktestContextValue {
  config: BacktestConfig;
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
  const params = useParams<{ step?: string; runId?: string }>();

  const [draft, setDraft] = useState(loadInitialDraft);
  const config = draft.config;
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
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
    setDraft((previous) => selectDraftSecurity(previous, security));
    setSubmitError(null);
    setSubmitFieldErrors(null);
  }, []);

  const getStepErrors = useCallback(
    (step: StepKey) => validationErrors.filter((e) => e.step === step),
    [validationErrors],
  );

  const validateCurrentStep = useCallback(() => {
    const sections = sectionsForPage(mode, currentStep);
    const errors = sections.flatMap((step) => validateBacktestConfig(config, step).errors);
    setValidationErrors((prev) => {
      const otherErrors = prev.filter((e) => !sections.includes(e.step));
      return [...otherErrors, ...errors];
    });
    return errors.length === 0;
  }, [config, currentStep, mode]);

  const validateAllSteps = useCallback(() => {
    const result = validateBacktestConfig(config);
    setValidationErrors(result.errors);
    return result.isValid;
  }, [config]);

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
    const validation = validateBacktestConfig(config);
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
      const response = await submitBacktestRun(dto);

      setRunId(response.id);
      // Navigate to status page using returned run identifier
      navigate(`/backtests/${response.id}/status`);
      return response;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSubmitError(err.body.message || 'Backtest submission failed.');
        setSubmitTraceId(err.body.trace_id || null);
        setSubmitFieldErrors(err.body.fields || null);

        // Map backend validation field errors to UI steps
        if (err.body.fields && err.body.fields.length > 0) {
          const apiValidationErrors: ValidationError[] = err.body.fields.map((f) => {
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
  }, [config, navigate]);

  const resetConfig = useCallback(() => {
    if (submissionPending.current) return;
    setDraft(createFreshBacktestDraft());
    setValidationErrors([]);
    setSubmitError(null);
    setSubmitFieldErrors(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    navigate(workflowLocation(mode, 'security'));
  }, [navigate, mode]);

  const value: BacktestContextValue = {
    config,
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

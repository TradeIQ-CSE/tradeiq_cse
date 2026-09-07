import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  BacktestConfig,
  StepKey,
  ValidationError,
  CreateBacktestRunResponse,
} from '../domain/types';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { validateBacktestConfig } from '../domain/validation';
import { mapToBacktestRequest } from '../domain/mapper';
import { submitBacktestRun } from '../api/backtestApi';
import { ApiError } from '../../../lib/api';

const WIZARD_STEPS: StepKey[] = [
  'security',
  'period',
  'rules',
  'execution',
  'portfolio',
  'metrics',
  'review',
];

const STORAGE_KEY = 'tradeiq_backtest_draft_v1';

export interface BacktestContextValue {
  config: BacktestConfig;
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
  goToStep: (step: StepKey) => void;
  goNext: () => boolean;
  goBack: () => void;
  validateCurrentStep: () => boolean;
  validateAllSteps: () => boolean;
  getStepErrors: (step: StepKey) => ValidationError[];
  submitBacktest: () => Promise<CreateBacktestRunResponse | null>;
  resetConfig: () => void;
}

const BacktestContext = createContext<BacktestContextValue | null>(null);

function loadInitialConfig(): BacktestConfig {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.security && parsed.period && parsed.rules) {
        return parsed;
      }
    }
  } catch {
    // Fall back to defaults on parse/storage error
  }
  return createDefaultBacktestConfig();
}

export const BacktestWizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ step?: string; runId?: string }>();

  const [config, setConfig] = useState<BacktestConfig>(loadInitialConfig);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitTraceId, setSubmitTraceId] = useState<string | null>(null);
  const [submitFieldErrors, setSubmitFieldErrors] = useState<Array<{ field: string; reason: string }> | null>(null);
  const [runId, setRunId] = useState<string | null>(params.runId || null);

  // Sync to session storage whenever config changes to preserve across refresh
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore quota/access errors
    }
  }, [config]);

  // Determine current step from URL path
  const currentStep: StepKey = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    // Path pattern: /backtests/new/:step
    const last = segments[segments.length - 1] as StepKey;
    if (WIZARD_STEPS.includes(last)) {
      return last;
    }
    return 'security';
  }, [location.pathname]);

  const stepIndex = WIZARD_STEPS.indexOf(currentStep);

  const updateConfig = useCallback(
    (patch: Partial<BacktestConfig> | ((prev: BacktestConfig) => BacktestConfig)) => {
      setConfig((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        return next;
      });
      // Clear submit errors when modifying inputs
      setSubmitError(null);
      setSubmitFieldErrors(null);
    },
    [],
  );

  const getStepErrors = useCallback(
    (step: StepKey) => validationErrors.filter((e) => e.step === step),
    [validationErrors],
  );

  const validateCurrentStep = useCallback(() => {
    const result = validateBacktestConfig(config, currentStep);
    setValidationErrors((prev) => {
      // Keep errors from other steps, replace current step errors
      const otherErrors = prev.filter((e) => e.step !== currentStep);
      return [...otherErrors, ...result.errors];
    });
    return result.isValid;
  }, [config, currentStep]);

  const validateAllSteps = useCallback(() => {
    const result = validateBacktestConfig(config);
    setValidationErrors(result.errors);
    return result.isValid;
  }, [config]);

  const goToStep = useCallback(
    (step: StepKey) => {
      navigate(`/backtests/new/${step}`);
    },
    [navigate],
  );

  const goNext = useCallback(() => {
    const isStepValid = validateCurrentStep();
    if (!isStepValid) {
      return false;
    }

    if (stepIndex < WIZARD_STEPS.length - 1) {
      const nextStep = WIZARD_STEPS[stepIndex + 1];
      navigate(`/backtests/new/${nextStep}`);
      return true;
    }
    return true;
  }, [stepIndex, validateCurrentStep, navigate]);

  const goBack = useCallback(() => {
    // Preserve all entered values; do not clear inputs or reset config
    if (stepIndex > 0) {
      const prevStep = WIZARD_STEPS[stepIndex - 1];
      navigate(`/backtests/new/${prevStep}`);
    } else {
      navigate('/markets');
    }
  }, [stepIndex, navigate]);

  const submitBacktest = useCallback(async (): Promise<CreateBacktestRunResponse | null> => {
    // Guard against duplicate submission while request is in progress
    if (isSubmitting) {
      return null;
    }

    // Comprehensive client-side validation check
    const validation = validateBacktestConfig(config);
    setValidationErrors(validation.errors);

    if (!validation.isValid) {
      setSubmitError('Please fix the validation issues before running the backtest.');
      return null;
    }

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
      setIsSubmitting(false);
    }
  }, [config, isSubmitting, navigate]);

  const resetConfig = useCallback(() => {
    const defaults = createDefaultBacktestConfig();
    setConfig(defaults);
    setValidationErrors([]);
    setSubmitError(null);
    setSubmitFieldErrors(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    navigate('/backtests/new/security');
  }, [navigate]);

  const value: BacktestContextValue = {
    config,
    currentStep,
    stepIndex,
    totalSteps: WIZARD_STEPS.length,
    allSteps: WIZARD_STEPS,
    validationErrors,
    isSubmitting,
    submitError,
    submitTraceId,
    submitFieldErrors,
    runId,
    updateConfig,
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

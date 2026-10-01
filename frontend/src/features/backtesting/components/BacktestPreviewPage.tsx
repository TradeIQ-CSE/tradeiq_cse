import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  RiArrowLeftLine,
  RiLoginBoxLine,
  RiSaveLine,
  RiUserAddLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  AppNotice,
  AppPage,
  PageIntro,
} from "@/components/application/layout/application-layout";
import { useAuth } from "../../../auth/useAuth";
import { ApiError } from "../../../lib/api";
import { useDataCoverage } from "../../markets/useDataCoverage";
import { submitBacktestRun } from "../api/backtestApi";
import { mapToBacktestRequest } from "../domain/mapper";
import { workflowLocation } from "../domain/workflow";
import {
  BacktestPreviewRecord,
  clearBacktestPreview,
  loadBacktestPreview,
} from "../domain/preview";
import { ResultsFooter, ResultsView } from "./StatusStep";
import { RunReveal } from "./RunReveal";
import { useRunReveal } from "./useRunReveal";

/**
 * Results of a backtest run without an account (POST /backtests/preview).
 * Nothing is stored on the server, so the page reads the result the wizard
 * handed over — navigation state first, this tab's sessionStorage after a
 * reload or a round trip through sign-in. Saving submits the same settings
 * as a normal run, which then lives at /backtests/:runId/status.
 */
import { useBacktestPolicy } from "../hooks/useBacktestPolicy";
import { backtestAvailabilityMessage, previousPeriod } from "../domain/bounds";
import { defaultBacktestPeriod } from "../domain/defaults";

export function BacktestPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status: authStatus } = useAuth();
  const policy = useBacktestPolicy();
  const coverageQuery = useDataCoverage();
  const priceGaps = coverageQuery.data?.prices.gaps ?? [];
  const [preview] = useState<BacktestPreviewRecord | null>(
    () =>
      (location.state as { preview?: BacktestPreviewRecord } | null)
        ?.preview ?? loadBacktestPreview(),
  );
  const { playing, finish: finishReveal } = useRunReveal();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!preview) {
    return <Navigate to={workflowLocation("simple", "security")} replace />;
  }

  const { config } = preview;
  const historical = previousPeriod(config.period.startDate, config.period.endDate, policy.maxDate);
  const changeSettings = () => {
    // Carry this preview's settings into the wizard, preserving all strategy values.
    const period = historical ? defaultBacktestPeriod(config.security.dataFrom, config.security.dataTo, priceGaps, policy.maxDate) : config.period;
    try { sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify({ ...config, period, periodUsesCoverageDefault: historical })); } catch { /* Storage can be unavailable. */ }
    navigate(workflowLocation('simple', historical ? 'period' : 'review'));
  };
  const revealing = playing;
  const returnHere = { from: { pathname: "/backtests/preview" } };

  const save = async () => {
    if (historical) { changeSettings(); return; }
    setIsSaving(true);
    setSaveError(null);
    try {
      const run = await submitBacktestRun(mapToBacktestRequest(config));
      clearBacktestPreview();
      navigate(`/backtests/${run.id}/status`);
    } catch (error: unknown) {
      setSaveError(
        error instanceof ApiError
          ? error.body.message
          : "Couldn’t save your test. Please try again.",
      );
      setIsSaving(false);
    }
  };

  return (
    <AppPage className="max-w-5xl">
      <PageIntro
        eyebrow="Backtesting"
        title="Your test results"
        description={`${config.security.symbol} · ${config.period.startDate} to ${config.period.endDate}`}
      />

      {historical && <AppNotice title="Result from a previous supported period"><div className="flex flex-col gap-3"><span>This result retains its original dates and calculations. {backtestAvailabilityMessage(policy.maxDate)} Choose supported dates and run again before saving a new result.</span><Button variant="secondary" onClick={changeSettings}>Choose supported dates</Button></div></AppNotice>}

      {authStatus === "authenticated" && !historical ? (
        <AppNotice title="This result isn't saved yet">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Save it to your account to come back to it later</span>
            <Button
              leadingIcon={RiSaveLine}
              onClick={save}
              disabled={isSaving}
              className="shrink-0"
            >
              {isSaving ? "Saving" : "Save this backtest"}
            </Button>
          </div>
        </AppNotice>
      ) : authStatus === "authenticated" ? null : (
        <AppNotice title="Want to keep this result?">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Create an account or sign in to save it. Until then it only
              stays in this tab
            </span>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                leadingIcon={RiUserAddLine}
                onClick={() => navigate("/signup", { state: returnHere })}
              >
                Create an account
              </Button>
              <Button
                variant="secondary"
                leadingIcon={RiLoginBoxLine}
                onClick={() => navigate("/login", { state: returnHere })}
              >
                Sign in
              </Button>
            </div>
          </div>
        </AppNotice>
      )}

      {saveError && (
        <AppNotice tone="error" title="Couldn’t save">
          {saveError}
        </AppNotice>
      )}

      {revealing ? (
        <RunReveal onDone={finishReveal} />
      ) : (
        <ResultsView results={{ ...preview.results, strategy: preview.results.strategy ?? { version: config.rules.version ?? '1.0', buyCondition: config.rules.buy, sellConditions: config.rules.sells, reentryCondition: config.rules.reentry } }} gaps={priceGaps} />
      )}

      <ResultsFooter>
        <Button
          variant="secondary"
          leadingIcon={RiArrowLeftLine}
          onClick={changeSettings}
          className="w-full sm:w-auto"
        >
          Change settings
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate("/markets")}
          className="w-full sm:w-auto"
        >
          Browse companies
        </Button>
      </ResultsFooter>
    </AppPage>
  );
}

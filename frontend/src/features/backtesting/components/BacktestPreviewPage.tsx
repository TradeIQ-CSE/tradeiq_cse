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
import { ResultsView } from "./StatusStep";

/**
 * Results of a backtest run without an account (POST /backtests/preview).
 * Nothing is stored on the server, so the page reads the result the wizard
 * handed over — navigation state first, this tab's sessionStorage after a
 * reload or a round trip through sign-in. Saving submits the same settings
 * as a normal run, which then lives at /backtests/:runId/status.
 */
export function BacktestPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status: authStatus } = useAuth();
  const coverageQuery = useDataCoverage();
  const priceGaps = coverageQuery.data?.prices.gaps ?? [];
  const [preview] = useState<BacktestPreviewRecord | null>(
    () =>
      (location.state as { preview?: BacktestPreviewRecord } | null)
        ?.preview ?? loadBacktestPreview(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!preview) {
    return <Navigate to={workflowLocation("simple", "security")} replace />;
  }

  const { config } = preview;
  const returnHere = { from: { pathname: "/backtests/preview" } };

  const save = async () => {
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
          : "The backtest could not be saved. Please try again.",
      );
      setIsSaving(false);
    }
  };

  return (
    <AppPage className="max-w-5xl">
      <PageIntro
        eyebrow="Historical simulation"
        title="Backtest result"
        description={`${config.security.symbol} · ${config.period.startDate} to ${config.period.endDate}`}
      />

      {authStatus === "authenticated" ? (
        <AppNotice title="This result isn't saved yet">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Save it to your account to come back to it later.
            </span>
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
      ) : (
        <AppNotice title="Want to keep this result?">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Create an account or sign in to save it. Until then it only
              stays in this browser tab.
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
        <AppNotice tone="error" title="Save failed">
          {saveError}
        </AppNotice>
      )}

      <ResultsView results={preview.results} gaps={priceGaps} />

      <AppNotice title="Interpret results carefully">
        This is a historical simulation based on available end-of-day data and
        the assumptions you supplied. It does not model every source of
        slippage, liquidity risk, or future market behaviour.
      </AppNotice>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          leadingIcon={RiArrowLeftLine}
          onClick={() => navigate(workflowLocation("simple", "review"))}
          className="w-full sm:w-auto"
        >
          Change the settings
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate("/markets")}
          className="w-full sm:w-auto"
        >
          Browse markets
        </Button>
      </div>
    </AppPage>
  );
}

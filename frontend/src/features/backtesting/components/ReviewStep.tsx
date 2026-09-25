import { RiPlayCircleLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { useAuth } from "../../../auth/useAuth";
import { formatDay } from "../domain/descriptions";
import { AVAILABLE_METRICS } from "../domain/defaults";
import { validateBacktestConfig } from "../domain/validation";
import { crossingNoticeLines } from "../domain/gapNotice";
import { RuleList, TradeSizeList } from "./RuleList";
import { crossingDataGaps } from "../../../lib/data-gaps";
import { STEP_LABELS } from "../domain/stepLabels";
import {
  BacktestStepHeader,
  ReviewRow,
  ReviewSection,
} from "./BacktestStepLayout";

// Matches PeriodStep's notice — see its own comment for why this feature
// hardcodes a locale rather than reading it from i18n.
const NOTICE_LOCALE = "en-LK";

export function ReviewStep({ configuration }: { configuration?: ReactNode }) {
  const {
    config,
    priceGaps,
    goToStep,
    submitBacktest,
    isSubmitting,
    submitError,
    submitTraceId,
    submitFieldErrors,
    validateAllSteps,
  } = useBacktestWizard();
  const { status: authStatus } = useAuth();
  const reviewValidation = validateBacktestConfig(config, undefined, priceGaps);
  const isValid = reviewValidation.isValid;
  const crossedGaps = crossingDataGaps(
    priceGaps,
    config.period.startDate,
    config.period.endDate,
  );
  const metricNames = config.metrics.selected.map(
    (id) => AVAILABLE_METRICS.find((metric) => metric.id === id)?.name || id,
  );

  const runBacktest = async () => {
    if (!validateAllSteps()) return;
    await submitBacktest();
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        title="Check and run"
        description="Check your settings, then run the test"
      />

      {!isValid && (
        <AppNotice tone="error" title={`Fix ${reviewValidation.errors.length} ${reviewValidation.errors.length === 1 ? "thing" : "things"} before running`}>
          <ul className="mt-1 flex list-disc flex-col gap-2 pl-5">
            {reviewValidation.errors.map((error, index) => (
              <li key={`${error.step}-${error.field}-${index}`}>
                {error.message}{" "}
                <Button variant="ghost" size="xs" disabled={isSubmitting} onClick={() => goToStep(error.step)}>
                  Go to {STEP_LABELS[error.step].toLowerCase()}
                </Button>
              </li>
            ))}
          </ul>
        </AppNotice>
      )}

      {crossedGaps.length > 0 && (
        <AppNotice
          title={
            crossedGaps.length > 1
              ? "Your dates include data gaps"
              : "Your dates include a data gap"
          }
        >
          <div className="flex flex-col gap-2">
            {crossedGaps.map((gap) => (
              <ul key={`${gap.from}-${gap.to}`} className="list-disc pl-5">
                {crossingNoticeLines(gap, NOTICE_LOCALE).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ))}
          </div>
        </AppNotice>
      )}

      {submitError && (
        <AppNotice tone="error" title="Couldn’t run the test">
          <div className="flex flex-col gap-2">
            <p>{submitError}</p>
            {submitFieldErrors && submitFieldErrors.length > 0 && (
              <ul className="list-disc pl-5">
                {submitFieldErrors.map((field, index) => (
                  <li key={`${field.field}-${index}`}>
                    <strong>{field.field}</strong>: {field.reason}
                  </li>
                ))}
              </ul>
            )}
            <p>Your settings are kept, so you can change them and try again.</p>
            {submitTraceId && (
              <p className="text-body-2-regular">
                Reference: <code>{submitTraceId}</code>
              </p>
            )}
          </div>
        </AppNotice>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ReviewSection title="Company" onEdit={() => goToStep("security")}>
          <ReviewRow
            label={config.security.symbol}
            value={config.security.companyName || "CSE listed company"}
          />
        </ReviewSection>

        <ReviewSection title="Dates" onEdit={() => goToStep("period")}>
          <ReviewRow
            label="From"
            value={formatDay(config.period.startDate)}
          />
          <ReviewRow label="To" value={formatDay(config.period.endDate)} />
        </ReviewSection>

        <ReviewSection title="Rules" onEdit={() => goToStep("rules")}>
          <RuleList rules={config.rules} />
        </ReviewSection>

        <ReviewSection title="Trade size" onEdit={() => goToStep("execution")}>
          <TradeSizeList execution={config.execution} />
        </ReviewSection>

        <ReviewSection title="Starting cash" onEdit={() => goToStep("portfolio")}>
          <ReviewRow
            label="Virtual money"
            value={`LKR ${Number(config.portfolio.startingCapital).toLocaleString(
              "en-LK",
            )}`}
          />
        </ReviewSection>

        {/* Simple mode edits the focus right below instead. */}
        {!configuration && (
          <ReviewSection title="Analysis focus" onEdit={() => goToStep("metrics")}>
            <p className="text-body-2-regular text-text-primary">
              {metricNames.join(" · ")}
            </p>
          </ReviewSection>
        )}
      </div>

      {configuration}

      <section className="flex flex-col items-start gap-4 rounded-3xl border border-border-button-default bg-background-secondary-default p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-0.5">
          <h3 className="text-headline-medium text-text-primary">
            Ready to run
          </h3>
          <p className="text-body-2-regular text-text-secondary">
            {authStatus === "authenticated"
              ? "The results are saved to your account"
              : "No account needed. Sign in afterwards to save the results"}
          </p>
        </div>
        <Button
          id="run-backtest-btn"
          leadingIcon={RiPlayCircleLine}
          onClick={runBacktest}
          disabled={!isValid || isSubmitting}
          className="w-full shrink-0 sm:w-auto"
        >
          {isSubmitting ? "Running" : "Run backtest"}
        </Button>
      </section>
    </div>
  );
}

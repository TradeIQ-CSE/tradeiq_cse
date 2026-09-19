import { RiPlayCircleLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { entryDescription, exitDescription, sizingDescription } from "../domain/descriptions";
import { AVAILABLE_METRICS } from "../domain/defaults";
import { validateBacktestConfig } from "../domain/validation";
import {
  BacktestStepHeader,
  ReviewRow,
  ReviewSection,
} from "./BacktestStepLayout";

export function ReviewStep({ configuration }: { configuration?: ReactNode }) {
  const {
    config,
    goToStep,
    submitBacktest,
    isSubmitting,
    submitError,
    submitTraceId,
    submitFieldErrors,
    validateAllSteps,
    stepIndex,
    totalSteps,
  } = useBacktestWizard();
  const reviewValidation = validateBacktestConfig(config);
  const isValid = reviewValidation.isValid;
  const totalFeesPct = (
    Object.values(config.execution.fees).reduce((sum, rate) => sum + rate, 0) *
    100
  ).toFixed(3);
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
        step={stepIndex + 1}
        total={totalSteps}
        title="Review simulation assumptions"
        description="Check the complete rule set before sending it to the historical simulation engine. You can return to any section without losing the draft."
      />

      {isValid ? (
        <AppNotice tone="success" title="Everything looks valid.">
          The current draft meets the client-side constraints and is ready to
          submit to the backtest API.
        </AppNotice>
      ) : (
        <AppNotice tone="error" title="Configuration requires attention">
          Resolve the {reviewValidation.errors.length} highlighted configuration
          {reviewValidation.errors.length === 1 ? " issue" : " issues"} before
          running the backtest.
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
            {reviewValidation.errors.map((error, index) => (
              <li key={`${error.step}-${error.field}-${index}`}>
                {error.message}{" "}
                <Button variant="ghost" size="xs" disabled={isSubmitting} onClick={() => goToStep(error.step)}>
                  Open {error.step}
                </Button>
              </li>
            ))}
          </ul>
        </AppNotice>
      )}

      {submitError && (
        <AppNotice tone="error" title="Submission Failed">
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
            {submitTraceId && (
              <p className="text-body-2-regular">
                Trace ID: <code>{submitTraceId}</code>
              </p>
            )}
            <p>Your parameters have been retained. You can edit and retry.</p>
          </div>
        </AppNotice>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ReviewSection title="Security" onEdit={() => goToStep("security")}>
          <ReviewRow
            label="Ticker"
            value={<Chip color="blue">{config.security.symbol}</Chip>}
          />
          <ReviewRow
            label="Company"
            value={config.security.companyName || "CSE listed security"}
          />
          <ReviewRow
            label="Sector"
            value={config.security.sector || "Not reported"}
          />
        </ReviewSection>

        <ReviewSection title="Historical period" onEdit={() => goToStep("period")}>
          <ReviewRow
            label="Inclusive date range"
            value={`${config.period.startDate} to ${config.period.endDate}`}
          />
          <ReviewRow label="Data frequency" value="Daily end-of-day bars" />
        </ReviewSection>

        <ReviewSection
          title="Entry and exit rules"
          onEdit={() => goToStep("rules")}
        >
          <ReviewRow
            label="Entry"
            value={entryDescription(
              config.rules.buy.type,
              config.rules.buy.value,
            )}
          />
          <div className="border-t border-separator-border pt-3">
            <p className="mb-2 text-body-2-regular text-text-secondary">
              Exits, first trigger wins
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body-regular text-text-primary">
              {config.rules.sells.map((sell) => (
                <li key={sell.type}>
                  {exitDescription(sell.type, sell.value)}
                </li>
              ))}
            </ul>
          </div>
        </ReviewSection>

        <ReviewSection
          title="Execution"
          onEdit={() => goToStep("execution")}
        >
          <ReviewRow
            label="Position size"
            value={sizingDescription(
              config.execution.positionSizing.type,
              config.execution.positionSizing.value,
            )}
          />
          <ReviewRow label="Combined transaction rate" value={`${totalFeesPct}%`} />
          <ReviewRow label="Share quantities" value="Whole shares, rounded down" />
          <ReviewRow
            label="Same-bar priority"
            value="Stop loss before take profit"
          />
        </ReviewSection>

        <ReviewSection title="Capital" onEdit={() => goToStep("portfolio")}>
          <ReviewRow
            label="Hypothetical starting cash"
            value={`LKR ${Number(config.portfolio.startingCapital).toLocaleString(
              "en-LK",
            )}`}
          />
        </ReviewSection>

        <ReviewSection title="Analysis focus" onEdit={() => goToStep("metrics")}>
          <div className="flex flex-wrap gap-2">
            {metricNames.map((name) => (
              <Chip key={name} color="soft" variant="caption">
                {name}
              </Chip>
            ))}
          </div>
        </ReviewSection>
      </div>

      {configuration}

      <section className="flex flex-col items-start gap-4 rounded-3xl border border-border-button-active bg-status-blue-background p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h3 className="text-headline-medium text-text-primary">
            Run this historical simulation
          </h3>
          <p className="text-body-regular text-text-secondary">
            TradeIQ will create an asynchronous run, track its status, and
            display only the results returned by the API. Historical output is
            not investment advice or a prediction.
          </p>
        </div>
        <Button
          id="run-backtest-btn"
          leadingIcon={RiPlayCircleLine}
          onClick={runBacktest}
          disabled={!isValid || isSubmitting}
          className="w-full shrink-0 sm:w-auto"
        >
          {isSubmitting ? "Submitting simulation" : "Run backtest"}
        </Button>
      </section>
    </div>
  );
}

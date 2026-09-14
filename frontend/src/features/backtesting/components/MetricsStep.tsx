import { RiCheckDoubleLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { CheckboxCard } from "@/components/base/checkbox/checkbox-card";
import { Chip } from "@/components/base/badges/chip";
import { AppNotice } from "@/components/application/layout/application-layout";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { AVAILABLE_METRICS } from "../domain/defaults";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
} from "./BacktestStepLayout";

export function MetricsStep() {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const metricsError = getStepErrors("metrics").find(
    (error) => error.field === "selected",
  );
  const selectedMetrics = config.metrics.selected;

  const toggleMetric = (id: string) => {
    updateConfig((previous) => {
      const selected = previous.metrics.selected;
      return {
        ...previous,
        metrics: {
          selected: selected.includes(id)
            ? selected.filter((metric) => metric !== id)
            : [...selected, id],
        },
      };
    });
  };

  const selectAll = () => {
    updateConfig((previous) => ({
      ...previous,
      metrics: { selected: AVAILABLE_METRICS.map((metric) => metric.id) },
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        step={6}
        title="Choose the metrics to focus on"
        description="These selections help you review which questions matter before submission. They do not change the strategy, trades, or execution rules."
      />

      <AppNotice title="Current results contract">
        Every completed run returns initial capital, final cash, final equity,
        the trade ledger, and the daily equity curve. TradeIQ only presents
        additional financial metrics when they are returned by the API rather
        than recomputing them in the browser.
      </AppNotice>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Analysis focus"
          description="Select at least one concept to carry into the review step."
          aside={
            <div className="flex items-center gap-2">
              <Chip color="blue">
                {selectedMetrics.length} of {AVAILABLE_METRICS.length}
              </Chip>
              <Button
                variant="secondary"
                size="small"
                leadingIcon={RiCheckDoubleLine}
                onClick={selectAll}
              >
                Select all
              </Button>
            </div>
          }
        />
        <BacktestFieldError>{metricsError?.message}</BacktestFieldError>
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="group"
          aria-label="Backtest analysis metrics"
        >
          {AVAILABLE_METRICS.map((metric) => {
            const isSelected = selectedMetrics.includes(metric.id);
            return (
              <CheckboxCard
                key={metric.id}
                isSelected={isSelected}
                onChange={() => toggleMetric(metric.id)}
                title={metric.name}
                description={metric.description}
                className={({ isSelected: selected }) =>
                  cx(
                    "h-full items-start",
                    selected &&
                      "border-border-button-active bg-status-blue-background",
                  )
                }
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

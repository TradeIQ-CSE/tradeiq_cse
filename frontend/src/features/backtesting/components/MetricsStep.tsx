import { RiCheckDoubleLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { CheckboxCard } from "@/components/base/checkbox/checkbox-card";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { AVAILABLE_METRICS } from "../domain/defaults";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
} from "./BacktestStepLayout";

export function MetricsStep({ embedded = false }: { embedded?: boolean }) {
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
        embedded={embedded}
        title="What to focus on"
        description="Pick the results you care about most"
      />

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Analysis focus"
          description={`${selectedMetrics.length} of ${AVAILABLE_METRICS.length} picked`}
          info="This only changes what you look at first. It doesn’t change the test. Every result shows your starting cash, final value, trades and daily portfolio value."
          aside={
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiCheckDoubleLine}
              onClick={selectAll}
            >
              Select all
            </Button>
          }
        />
        <BacktestFieldError>{metricsError?.message}</BacktestFieldError>
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="group"
          aria-label="Analysis focus"
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

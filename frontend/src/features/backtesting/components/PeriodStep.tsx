import { parseDate, type CalendarDate } from "@internationalized/date";
import { RiCalendarCheckLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/base/date-picker/date-range-picker";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import {
  CSE_DATASET_MAX_DATE,
  CSE_DATASET_MIN_DATE,
} from "../domain/defaults";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
} from "./BacktestStepLayout";

function laterDate(left: CalendarDate, right: CalendarDate) {
  return left.compare(right) > 0 ? left : right;
}

function parseDateOr(value: string | null | undefined, fallback: CalendarDate) {
  if (!value) return fallback;
  try {
    return parseDate(value);
  } catch {
    return fallback;
  }
}

function buildPresets(minimum: CalendarDate, maximum: CalendarDate) {
  return [1, 2, 5].map((years) => ({
    label: `${years} ${years === 1 ? "year" : "years"}`,
    value: {
      start: laterDate(
        minimum,
        maximum.subtract({ years }).add({ days: 1 }),
      ),
      end: maximum,
    },
  }));
}

export function PeriodStep() {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors("period");
  const startError = errors.find((error) => error.field === "startDate");
  const endError = errors.find((error) => error.field === "endDate");

  const datasetMinimum = parseDate(CSE_DATASET_MIN_DATE);
  const datasetMaximum = parseDate(CSE_DATASET_MAX_DATE);
  const reportedMinimum = parseDateOr(
    config.security.dataFrom,
    datasetMinimum,
  );
  const reportedMaximum = parseDateOr(
    config.security.dataTo,
    datasetMaximum,
  );
  const hasValidCoverage = reportedMinimum.compare(reportedMaximum) <= 0;
  const minimum = hasValidCoverage ? reportedMinimum : datasetMinimum;
  const maximum = hasValidCoverage ? reportedMaximum : datasetMaximum;
  const value: DateRangeValue = {
    start: parseDateOr(config.period.startDate, minimum),
    end: parseDateOr(config.period.endDate, maximum),
  };
  const presets = buildPresets(minimum, maximum);

  const applyRange = (range: DateRangeValue | null) => {
    if (!range) return;
    updateConfig((previous) => ({
      ...previous,
      period: {
        startDate: range.start.toString(),
        endDate: range.end.toString(),
      },
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        step={2}
        title="Choose the historical period"
        description="The engine checks each available daily bar inside this inclusive date range. A longer range offers more observations, but it does not make future outcomes more certain."
      />

      <AppNotice title="Available price coverage">
        {config.security.symbol
          ? `${config.security.symbol} currently reports data from ${minimum.toString()} to ${maximum.toString()}.`
          : `Choose dates within the declared CSE dataset boundary of ${minimum.toString()} to ${maximum.toString()}.`}
      </AppNotice>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Simulation date range"
          description="Both dates are included. The calendar prevents dates outside the selected security’s reported coverage."
        />
        <div className="flex max-w-xl flex-col gap-2">
          <DateRangePicker
            value={value}
            onChange={applyRange}
            minValue={minimum}
            maxValue={maximum}
            isInvalid={Boolean(startError || endError)}
            describedBy="backtest-period-help"
            aria-label="Backtest simulation date range"
            labels={{ apply: "Apply range" }}
          />
          <p
            id="backtest-period-help"
            className="text-body-2-regular text-text-tertiary"
          >
            Selected: {value.start.toString()} to {value.end.toString()}
          </p>
          <BacktestFieldError>
            {startError?.message || endError?.message}
          </BacktestFieldError>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Quick ranges"
          description="Each preset ends on the latest date reported for this security and is clipped to its available coverage."
        />
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isActive =
              value.start.compare(preset.value.start) === 0 &&
              value.end.compare(preset.value.end) === 0;
            return (
              <Button
                key={preset.label}
                variant={isActive ? "primary" : "secondary"}
                size="small"
                onClick={() => applyRange(preset.value)}
              >
                {preset.label}
              </Button>
            );
          })}
          <Button
            variant={
              value.start.compare(minimum) === 0 &&
              value.end.compare(maximum) === 0
                ? "primary"
                : "secondary"
            }
            size="small"
            leadingIcon={RiCalendarCheckLine}
            onClick={() => applyRange({ start: minimum, end: maximum })}
          >
            Full available range
          </Button>
        </div>
      </section>
    </div>
  );
}

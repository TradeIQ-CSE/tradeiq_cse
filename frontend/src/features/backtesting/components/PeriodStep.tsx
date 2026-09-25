import { parseDate, type CalendarDate } from "@internationalized/date";
import { RiCalendarCheckLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/base/date-picker/date-range-picker";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { formatDay } from "../domain/descriptions";
import {
  CSE_DATASET_MAX_DATE,
  CSE_DATASET_MIN_DATE,
} from "../domain/defaults";
import { crossingNoticeLines } from "../domain/gapNotice";
import {
  backtestDateGap,
  crossingDataGaps,
  dateInGapMessage,
  isBacktestDateUnavailable,
  snapOutOfDataGap,
  type DataGap,
} from "../../../lib/data-gaps";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
} from "./BacktestStepLayout";

// Formatted dates throughout this step follow the rest of the backtesting
// feature (e.g. ReviewStep's LKR figures), which has no i18n wiring of its
// own yet — see AGENTS.md's scope for this PR.
const NOTICE_LOCALE = "en-LK";

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

/** Snaps a computed preset/full-range boundary off a `missing_data` gap it
 * falls in (docs/plans/data-gap-handling.md §5), same rule the API applies. */
function gapAwareBound(
  gaps: readonly DataGap[],
  date: CalendarDate,
  role: "start" | "end",
): CalendarDate {
  const snapped = snapOutOfDataGap(gaps, date.toString(), role);
  return snapped === date.toString() ? date : parseDate(snapped);
}

function buildPresets(
  minimum: CalendarDate,
  maximum: CalendarDate,
  gaps: readonly DataGap[],
) {
  return [1, 2, 5].map((years) => ({
    label: `${years} ${years === 1 ? "year" : "years"}`,
    value: {
      start: gapAwareBound(
        gaps,
        laterDate(minimum, maximum.subtract({ years }).add({ days: 1 })),
        "start",
      ),
      end: gapAwareBound(gaps, maximum, "end"),
    },
  }));
}

export function PeriodStep({ embedded = false }: { embedded?: boolean }) {
  const { config, updateConfig, getStepErrors, priceGaps } = useBacktestWizard();
  const errors = getStepErrors("period");

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
  const gapAwareMinimum = gapAwareBound(priceGaps, minimum, "start");
  const gapAwareMaximum = gapAwareBound(priceGaps, maximum, "end");
  const value: DateRangeValue = {
    start: parseDateOr(config.period.startDate, minimum),
    end: parseDateOr(config.period.endDate, maximum),
  };
  const presets = buildPresets(minimum, maximum, priceGaps);
  const crossedGaps = crossingDataGaps(
    priceGaps,
    value.start.toString(),
    value.end.toString(),
  );

  // The calendar (isBacktestDateUnavailable) now only blocks a date already
  // inside a missing_data gap, not one whose role-specific roll would land
  // in one — that role-aware check happens here instead, computed straight
  // from the committed range so a bad role (e.g. a weekend end that rolls
  // back into a gap) shows its field error the moment it's picked, not only
  // after Next/Run reruns validateCurrentStep. `errors` (from context) wins
  // when present so an API-returned or dataset-bounds error is never masked.
  const liveStartGap = backtestDateGap(priceGaps, value.start.toString(), "start");
  const liveEndGap = backtestDateGap(priceGaps, value.end.toString(), "end");
  const startError =
    errors.find((error) => error.field === "startDate") ??
    (liveStartGap
      ? { step: "period" as const, field: "startDate", message: dateInGapMessage(liveStartGap) }
      : undefined);
  const endError =
    errors.find((error) => error.field === "endDate") ??
    (liveEndGap
      ? { step: "period" as const, field: "endDate", message: dateInGapMessage(liveEndGap) }
      : undefined);

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
        embedded={embedded}
        title="Choose dates"
        description="Pick the stretch of past prices to test on"
      />

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Dates"
          description={
            config.security.symbol
              ? `${config.security.symbol} has prices from ${formatDay(minimum.toString())} to ${formatDay(maximum.toString())}`
              : `Prices run from ${formatDay(minimum.toString())} to ${formatDay(maximum.toString())}`
          }
          info="Both dates are included, and only days the market traded are used. A longer stretch gives more to learn from, but it doesn’t make the future more certain."
        />
        <div className="flex max-w-xl flex-col gap-2">
          <DateRangePicker
            value={value}
            onChange={applyRange}
            minValue={minimum}
            maxValue={maximum}
            isDateUnavailable={(date) =>
              isBacktestDateUnavailable(priceGaps, date.toString())
            }
            isInvalid={Boolean(startError || endError)}
            describedBy="backtest-period-help"
            aria-label="Backtest simulation date range"
            labels={{ apply: "Apply range" }}
          />
          {/* The picker already shows the range; this is its screen-reader
              description only. */}
          <p id="backtest-period-help" className="sr-only">
            Selected: {value.start.toString()} to {value.end.toString()}
          </p>
          <BacktestFieldError>
            {startError?.message || endError?.message}
          </BacktestFieldError>
        </div>
      </section>

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

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Quick picks"
          info="Each one ends on the latest day with prices for this company."
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
              value.start.compare(gapAwareMinimum) === 0 &&
              value.end.compare(gapAwareMaximum) === 0
                ? "primary"
                : "secondary"
            }
            size="small"
            leadingIcon={RiCalendarCheckLine}
            onClick={() =>
              applyRange({ start: gapAwareMinimum, end: gapAwareMaximum })
            }
          >
            All dates
          </Button>
        </div>
      </section>
    </div>
  );
}

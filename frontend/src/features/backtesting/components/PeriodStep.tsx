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
import { defaultBacktestPeriod } from "../domain/defaults";
import { backtestBounds, suggestedBacktestPeriod, backtestAvailabilityMessage } from "../domain/bounds";
import { crossingNoticeLines } from "../domain/gapNotice";
import {
  backtestDateGap,
  crossingDataGaps,
  dateInGapMessage,
  isBacktestDateUnavailable,
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

function parseDateOr(value: string | null | undefined, fallback: CalendarDate) {
  try { return parseDate(value ?? fallback.toString()); } catch { return fallback; }
}

export function PeriodStep({ embedded = false }: { embedded?: boolean }) {
  const { config, updateConfig, getStepErrors, priceGaps, maxDate, policyIsFallback } = useBacktestWizard();
  const errors = getStepErrors("period");

  const bounds = backtestBounds(config.security.dataFrom, config.security.dataTo, maxDate);
  const minimum = parseDate(bounds.minimum);
  const maximum = parseDate(bounds.maximum);
  const allDates = suggestedBacktestPeriod(config.security.dataFrom, config.security.dataTo, priceGaps, maxDate);
  const suggestion = defaultBacktestPeriod(config.security.dataFrom, config.security.dataTo, priceGaps, maxDate);
  const available = bounds.available && allDates !== null;
  const value: DateRangeValue = { start: parseDateOr(config.period.startDate, minimum), end: parseDateOr(config.period.endDate, maximum) };
  const presets = [1, 2, 5].flatMap((years) => {
    const period = suggestedBacktestPeriod(config.security.dataFrom, config.security.dataTo, priceGaps, maxDate, years);
    return period ? [{ label: `${years} ${years === 1 ? 'year' : 'years'}`, value: { start: parseDate(period.startDate), end: parseDate(period.endDate) } }] : [];
  });
  const gapAwareMinimum = parseDate(allDates?.startDate ?? bounds.minimum);
  const gapAwareMaximum = parseDate(allDates?.endDate ?? bounds.maximum);
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

  if (!available) return <div className="flex flex-col gap-6"><BacktestStepHeader embedded={embedded} title="Choose dates" description="Pick the stretch of past prices to test on" /><AppNotice title="No eligible backtesting period">This company has no available history in the supported period. {backtestAvailabilityMessage(maxDate)} Choose another company.</AppNotice></div>;

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        embedded={embedded}
        title="Choose dates"
        description="Pick the stretch of past prices to test on"
      />

      <p className="text-body-2-regular text-text-secondary">{backtestAvailabilityMessage(maxDate)}{policyIsFallback ? ' Using the temporary limit while checking availability.' : ''}</p>
      {(startError || endError) && suggestion.startDate && <Button variant="secondary" size="small" onClick={() => updateConfig((previous) => ({ ...previous, period: suggestion }))}>Use suggested period</Button>}
      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Dates"
          description={
            config.security.symbol
              ? `${config.security.symbol} can be backtested from ${formatDay(minimum.toString())} to ${formatDay(maximum.toString())}`
              : `Available backtesting period: ${formatDay(minimum.toString())} to ${formatDay(maximum.toString())}`
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
            showsQuickSelect={false}
            validateTypedDate={(date, role) => {
              if (!date) return `Enter a real ${role} date in DD/MM/YYYY format.`;
              if (date.compare(maximum) > 0) return `${backtestAvailabilityMessage(maxDate)} Choose a date on or before ${formatDay(bounds.maximum)}.`;
              if (date.compare(minimum) < 0) return `Choose a date on or after ${formatDay(bounds.minimum)}.`;
              const gap = backtestDateGap(priceGaps, date.toString(), role);
              return gap ? dateInGapMessage(gap) : undefined;
            }}
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
          info="Each one ends on the last available day in the supported backtesting period."
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

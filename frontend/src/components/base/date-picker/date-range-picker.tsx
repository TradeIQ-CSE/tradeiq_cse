"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Popover,
  RangeCalendar,
} from "react-aria-components";
import {
  CalendarDate,
  endOfMonth,
  endOfYear,
  getLocalTimeZone,
  isSameDay,
  startOfMonth,
  startOfYear,
  today,
} from "@internationalized/date";
import { RiCalendarLine } from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import {
  DateChipInput,
  MonthPanel,
  formatTriggerDate,
  popoverClassName,
  triggerButtonClassName,
} from "@/components/base/date-picker/shared";
import { cx } from "@/utils/cx";
import {
  useDismissOnOutsidePress,
  useTriggerToggle,
} from "@/utils/use-dismiss-on-outside-press";

/**
 * Figma source: Board UI → "Calendar" (node 3871:5738).
 *
 * A dual-month date range picker: trigger button opens a popover with a
 * quick-select sidebar, two adjacent months (react-aria's
 * `visibleDuration={{ months: 2 }}`), and a footer with read-only date chips,
 * a "N days selected" pill, and Cancel/Apply.
 *
 * Two deliberate departures from the raw Figma frame:
 *  - The prev/next chevrons in Figma appear on *both* sides of *both* month
 *    headers (4 total), pre-rotated generic vector exports. A dual-month
 *    calendar only has one navigation state (the two months always stay
 *    adjacent), so only the outer two chevrons (prev on month 1, next on
 *    month 2) are wired up; the inner two slots are kept as invisible
 *    spacers rather than dead click targets, preserving Figma's header
 *    spacing without fake buttons.
 *  - The connecting range background (Figma: one hardcoded `bg-blue-100`
 *    rectangle sized for the one example range shown) is generalized into a
 *    per-cell layered background driven by react-aria's `isSelectionStart` /
 *    `isSelectionEnd` state, so any range length/position renders correctly.
 *
 * Colors/radii/spacing (semantic range-selection blues, blue-500/600,
 * radius/2lg/xl/2xl/3xl,
 * shadow-xs, background/secondary/default, background/tertiary/default,
 * border/button/default) are Tailwind v4 defaults or existing semantic
 * tokens — see styles/theme.css.
 *
 * Shared chrome (chevrons, day cell, month panel, editable date chip, trigger
 * + popover surfaces) lives in `./shared` — `DatePicker` (single-month,
 * non-range) reuses the same pieces.
 */

export interface DateRangeValue {
  start: CalendarDate;
  end: CalendarDate;
}

export interface DateRangePickerProps {
  value?: DateRangeValue | null;
  defaultValue?: DateRangeValue | null;
  onChange?: (value: DateRangeValue | null) => void;
  isDisabled?: boolean;
  minValue?: CalendarDate;
  maxValue?: CalendarDate;
  isInvalid?: boolean;
  describedBy?: string;
  className?: string;
  "aria-label"?: string;
  /** Trigger text shown when no range is committed yet. Default "Select date range". */
  placeholder?: string;
  labels?: Partial<DateRangePickerLabels>;
}

export interface DateRangePickerLabels {
  today: string;
  yesterday: string;
  lastWeek: string;
  thisMonth: string;
  lastMonth: string;
  thisYear: string;
  lastYear: string;
  allTime: string;
  startDate: string;
  endDate: string;
  selectedDays: (count: number) => string;
  cancel: string;
  apply: string;
}

const DEFAULT_LABELS: DateRangePickerLabels = {
  today: "Today",
  yesterday: "Yesterday",
  lastWeek: "Last week",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year",
  lastYear: "Last year",
  allTime: "All time",
  startDate: "Start date",
  endDate: "End date",
  selectedDays: (count) => `${count} day${count === 1 ? "" : "s"} selected`,
  cancel: "Cancel",
  apply: "Apply",
};

function daysInRange(value: DateRangeValue) {
  const tz = getLocalTimeZone();
  const ms = value.end.toDate(tz).getTime() - value.start.toDate(tz).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function clampDate(
  value: CalendarDate,
  minValue?: CalendarDate,
  maxValue?: CalendarDate,
) {
  if (minValue && value.compare(minValue) < 0) return minValue;
  if (maxValue && value.compare(maxValue) > 0) return maxValue;
  return value;
}

function useQuickSelectPresets(
  labels: DateRangePickerLabels,
  minValue?: CalendarDate,
  maxValue?: CalendarDate,
) {
  return useMemo(() => {
    const calendarToday = today(getLocalTimeZone());
    const now =
      maxValue && maxValue.compare(calendarToday) < 0
        ? maxValue
        : calendarToday;
    const lastMonth = now.subtract({ months: 1 });
    const lastYear = now.subtract({ years: 1 });
    const clamp = (value: CalendarDate) => {
      if (minValue && value.compare(minValue) < 0) return minValue;
      if (maxValue && value.compare(maxValue) > 0) return maxValue;
      return value;
    };
    return [
      { label: labels.today, range: { start: now, end: now } },
      {
        label: labels.yesterday,
        range: {
          start: now.subtract({ days: 1 }),
          end: now.subtract({ days: 1 }),
        },
      },
      {
        label: labels.lastWeek,
        range: {
          start: now.subtract({ days: 7 }),
          end: now.subtract({ days: 1 }),
        },
      },
      {
        label: labels.thisMonth,
        range: { start: startOfMonth(now), end: endOfMonth(now) },
      },
      {
        label: labels.lastMonth,
        range: { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) },
      },
      {
        label: labels.thisYear,
        range: { start: startOfYear(now), end: endOfYear(now) },
      },
      {
        label: labels.lastYear,
        range: { start: startOfYear(lastYear), end: endOfYear(lastYear) },
      },
      {
        label: labels.allTime,
        range: { start: minValue ?? now.subtract({ years: 10 }), end: now },
      },
    ]
      .map((preset) => ({
        ...preset,
        range: {
          start: clamp(preset.range.start),
          end: clamp(preset.range.end),
        },
      }))
      .filter((preset) => preset.range.start.compare(preset.range.end) <= 0);
  }, [labels, maxValue, minValue]);
}

function isPresetActive(value: DateRangeValue | null, range: DateRangeValue) {
  return (
    !!value &&
    isSameDay(value.start, range.start) &&
    isSameDay(value.end, range.end)
  );
}

function QuickSelect({
  value,
  onSelect,
  labels,
  minValue,
  maxValue,
}: {
  value: DateRangeValue | null;
  onSelect: (range: DateRangeValue) => void;
  labels: DateRangePickerLabels;
  minValue?: CalendarDate;
  maxValue?: CalendarDate;
}) {
  const presets = useQuickSelectPresets(labels, minValue, maxValue);

  return (
    <div className="flex w-[118px] shrink-0 flex-col gap-1.5">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onSelect(preset.range)}
          className={cx(
            "w-full cursor-pointer rounded-2lg px-2 py-1.5 text-left text-body-medium text-text-primary transition-colors duration-150 ease",
            isPresetActive(value, preset.range)
              ? "bg-background-tertiary-default"
              : "hover:bg-background-secondary-hover",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function Footer({
  value,
  onChange,
  onCancel,
  onApply,
  labels,
  minValue,
  maxValue,
}: {
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue) => void;
  onCancel: () => void;
  onApply: () => void;
  labels: DateRangePickerLabels;
  minValue?: CalendarDate;
  maxValue?: CalendarDate;
}) {
  return (
    <div className="flex flex-col gap-3 pt-3 sm:pr-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <AnimatePresence>
          {value && (
            <motion.div
              key="range-summary"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.34, 1.2, 0.64, 1] }}
              className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5"
            >
              <div className="flex items-center gap-[5px]">
                <DateChipInput
                  date={value.start}
                  label={labels.startDate}
                  onCommit={(nextStart) => {
                    const start = clampDate(nextStart, minValue, maxValue);
                    onChange({
                      start,
                      end: start.compare(value.end) > 0 ? start : value.end,
                    });
                  }}
                />
                <span className="text-body-medium text-text-secondary">-</span>
                <DateChipInput
                  date={value.end}
                  label={labels.endDate}
                  onCommit={(nextEnd) => {
                    const end = clampDate(nextEnd, minValue, maxValue);
                    onChange({
                      start: end.compare(value.start) < 0 ? end : value.start,
                      end,
                    });
                  }}
                />
              </div>
              <span className="rounded-xl bg-background-tertiary-default px-2 py-2 text-body-medium text-text-secondary">
                {labels.selectedDays(daysInRange(value))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-end gap-2.5">
        <Button variant="secondary" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button onClick={onApply} disabled={!value}>
          {labels.apply}
        </Button>
      </div>
    </div>
  );
}

export function DateRangePicker({
  value,
  defaultValue = null,
  onChange,
  isDisabled,
  minValue,
  maxValue,
  isInvalid,
  describedBy,
  className,
  "aria-label": ariaLabel = "Date range",
  placeholder = "Select date range",
  labels: labelOverrides,
}: DateRangePickerProps) {
  const labels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides],
  );
  const [isWide, setIsWide] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<DateRangeValue | null>(
    defaultValue,
  );
  const committedValue = isControlled ? (value ?? null) : internalValue;

  const [pendingValue, setPendingValue] = useState<DateRangeValue | null>(
    committedValue,
  );

  const commit = (next: DateRangeValue | null) => {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [
    triggerRef,
    popoverRef,
  ]);
  // Pressing the trigger while open closes the popover instead of reopening
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!allowOpenChange(open)) return;
        if (open) setPendingValue(committedValue);
        setIsOpen(open);
      }}
    >
      <AriaButton
        ref={triggerRef}
        isDisabled={isDisabled}
        aria-label={ariaLabel}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        className={cx(triggerButtonClassName, className)}
      >
        <RiCalendarLine
          className="size-5 shrink-0 text-foreground-icon-primary"
          aria-hidden
        />
        <span className="flex items-center justify-center whitespace-nowrap px-1 text-body-medium text-text-primary">
          {committedValue
            ? `${formatTriggerDate(committedValue.start)} - ${formatTriggerDate(committedValue.end)}`
            : placeholder}
        </span>
      </AriaButton>
      <Popover
        ref={popoverRef}
        offset={4}
        placement="bottom end"
        isNonModal
        className={cx(
          popoverClassName,
          "max-w-[calc(100vw-1.5rem)] overflow-x-auto",
        )}
      >
        <Dialog aria-label={ariaLabel} className="outline-none">
          {({ close }) => (
            <RangeCalendar
              aria-label={ariaLabel}
              visibleDuration={{ months: isWide ? 2 : 1 }}
              value={pendingValue}
              onChange={setPendingValue}
              minValue={minValue}
              maxValue={maxValue}
            >
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="hidden pt-4 pl-4 lg:block">
                  <QuickSelect
                    value={pendingValue}
                    onSelect={(range) => setPendingValue(range)}
                    labels={labels}
                    minValue={minValue}
                    maxValue={maxValue}
                  />
                </div>
                <div className="flex flex-col px-2 pt-2 pb-3 lg:pr-2 lg:pl-0">
                  <div className="flex gap-2">
                    <MonthPanel offset={0} showPrev showNext={!isWide} />
                    {isWide && <MonthPanel offset={1} showNext />}
                  </div>
                  <Footer
                    value={pendingValue}
                    onChange={setPendingValue}
                    labels={labels}
                    minValue={minValue}
                    maxValue={maxValue}
                    onCancel={() => {
                      setPendingValue(committedValue);
                      close();
                    }}
                    onApply={() => {
                      commit(pendingValue);
                      close();
                    }}
                  />
                </div>
              </div>
            </RangeCalendar>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

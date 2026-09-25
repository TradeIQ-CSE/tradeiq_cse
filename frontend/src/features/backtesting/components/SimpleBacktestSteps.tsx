import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { InfoTip } from "@/components/domain/info-tip";
import { Input } from "@/components/base/input/input";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { createDefaultBacktestConfig, defaultBacktestPeriod } from "../domain/defaults";
import type { StepKey } from "../domain/types";
import { SecurityStep } from "./SecurityStep";
import { PeriodStep } from "./PeriodStep";
import { RulesStep } from "./RulesStep";
import { ExecutionStep } from "./ExecutionStep";
import { MetricsStep } from "./MetricsStep";
import { BacktestStepHeader } from "./BacktestStepLayout";
import { formatDay } from "../domain/descriptions";
import { RuleList, TradeSizeList } from "./RuleList";

/** A composition of the installed BoardUI button and panel styles. */
function ConfigureSection({
  section, title, summary, info, actionLabel = title.toLowerCase(), custom = false, children,
}: {
  section: StepKey;
  title: string;
  summary: ReactNode;
  /** Short explanation shown in the "i" tooltip next to the title. */
  info?: ReactNode;
  actionLabel?: string;
  custom?: boolean;
  children: ReactNode;
}) {
  const { hash, key } = useLocation();
  const { getStepErrors, isSubmitting } = useBacktestWizard();
  const hasErrors = getStepErrors(section).length > 0;
  const [open, setOpen] = useState(hash === `#${section}` || hasErrors);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasErrors || hash === `#${section}`) setOpen(true);
  }, [hasErrors, hash, key, section]);

  useEffect(() => {
    if (!open || (!hasErrors && hash !== `#${section}`)) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>('[aria-invalid="true"], input, [role="radio"], [role="checkbox"], button');
      (target ?? panel)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, hasErrors, hash, section]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-1">
              <h3 className="text-headline-medium text-text-primary">{title}</h3>
              {info && <InfoTip label={title}>{info}</InfoTip>}
            </div>
            {custom && <span className="text-caption-1-medium text-text-secondary">Edited</span>}
          </div>
          <div className="mt-1 text-body-2-regular text-text-secondary">{summary}</div>
        </div>
        <Button
          variant="secondary" size="small"
          trailingIcon={open ? RiArrowUpSLine : RiArrowDownSLine}
          aria-expanded={open} aria-controls={panelId}
          disabled={isSubmitting}
          onClick={() => setOpen((previous) => !previous)}
          className="shrink-0"
        >
          {open ? "Hide" : "Change"} {actionLabel}
        </Button>
      </div>
      <div id={panelId} ref={panelRef} tabIndex={-1} hidden={!open} className="border-t border-separator-border pt-5 outline-none">
        {children}
      </div>
    </section>
  );
}

export function SimpleCompanyStep() {
  const { config, priceGaps } = useBacktestWizard();
  const suggested = defaultBacktestPeriod(config.security.dataFrom, config.security.dataTo, priceGaps);
  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader title="Choose a company and dates"
        description="Pick a company. Its latest year of prices is chosen for you" />
      <SecurityStep embedded />
      <ConfigureSection section="period" title="Dates"
        info="Both dates are included. Only days the market traded are used."
        custom={JSON.stringify(config.period) !== JSON.stringify(suggested)}
        summary={<p>{formatDay(config.period.startDate)} to {formatDay(config.period.endDate)}</p>}>
        <PeriodStep embedded />
      </ConfigureSection>
    </div>
  );
}

export function SimpleIdeaStep() {
  const { config, updateConfig, getStepErrors, isSubmitting } = useBacktestWizard();
  const { hash } = useLocation();
  const capitalRef = useRef<HTMLInputElement>(null);
  const defaults = createDefaultBacktestConfig();
  const capitalError = getStepErrors("portfolio").find((error) => error.field === "startingCapital");
  useEffect(() => {
    if (hash === "#portfolio" || capitalError) capitalRef.current?.focus();
  }, [hash, capitalError]);
  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader title="When to buy and sell"
        description="Example rules are filled in · Change them or continue" />
      <ConfigureSection section="rules" title="Buy and sell rules" actionLabel="buy and sell rules"
        info="These are examples to learn with, not advice on when to trade. The first sell rule to trigger closes the trade."
        custom={JSON.stringify(config.rules) !== JSON.stringify(defaults.rules)}
        summary={<RuleList rules={config.rules} />}>
        <RulesStep embedded />
      </ConfigureSection>
      <section id="portfolio" className="flex flex-col gap-3">
        <Input type="number" label="Virtual starting cash (LKR)"
          ref={capitalRef}
          value={Number.isNaN(config.portfolio.startingCapital) ? "" : String(config.portfolio.startingCapital)}
          onChange={(value) => updateConfig((previous) => ({
            ...previous, portfolio: { ...previous.portfolio, startingCapital: Number.parseFloat(value) },
          }))}
          min={1} step={1000} isDisabled={isSubmitting} isInvalid={Boolean(capitalError)}
          hint={capitalError?.message || "Virtual money only · No real money is used"}
          className="max-w-md" />
      </section>
      <ConfigureSection section="execution" title="Trade size and charges" actionLabel="trade settings"
        info="Charges are the standard CSE fees. Shares are bought in whole numbers, and leftover cash stays in the portfolio."
        custom={JSON.stringify(config.execution) !== JSON.stringify(defaults.execution)}
        summary={<TradeSizeList execution={config.execution} />}>
        <ExecutionStep embedded />
      </ConfigureSection>
    </div>
  );
}

export function SimpleAnalysisSection() {
  const { config } = useBacktestWizard();
  const defaults = createDefaultBacktestConfig();
  return (
    <ConfigureSection section="metrics" title="Analysis focus"
      info="This only changes what you look at first. It doesn't change the test."
      custom={JSON.stringify(config.metrics) !== JSON.stringify(defaults.metrics)}
      summary="Optional · Pick the results you care about most">
      <MetricsStep embedded />
    </ConfigureSection>
  );
}

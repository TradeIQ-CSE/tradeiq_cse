import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Input } from "@/components/base/input/input";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { createDefaultBacktestConfig, defaultBacktestPeriod } from "../domain/defaults";
import type { StepKey } from "../domain/types";
import { SecurityStep } from "./SecurityStep";
import { PeriodStep } from "./PeriodStep";
import { RulesStep } from "./RulesStep";
import { ExecutionStep } from "./ExecutionStep";
import { MetricsStep } from "./MetricsStep";
import { BacktestStepHeader } from "./BacktestStepLayout";
import { entryDescription, exitDescription, sizingDescription } from "../domain/descriptions";

/** A composition of the installed BoardUI button and panel styles. */
function ConfigureSection({
  section, title, summary, actionLabel = title.toLowerCase(), custom = false, children,
}: {
  section: StepKey;
  title: string;
  summary: ReactNode;
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
    <section className="flex flex-col gap-3 rounded-3xl border border-border-button-default bg-background-secondary-default p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-headline-medium text-text-primary">{title}</h3>
            {custom && <Chip color="blue" variant="subtle">Custom</Chip>}
          </div>
          <div className="text-body-regular text-text-secondary">{summary}</div>
        </div>
        <Button
          variant="secondary" size="small"
          trailingIcon={open ? RiArrowUpSLine : RiArrowDownSLine}
          aria-expanded={open} aria-controls={panelId}
          disabled={isSubmitting}
          onClick={() => setOpen((previous) => !previous)}
          className="shrink-0"
        >
          {open ? "Hide" : "Configure"} {actionLabel}
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
      <BacktestStepHeader step={1} total={3} title="Choose a company and period"
        description="Choose one listed company. A recent year of its available history is selected for you, and you can change the exact dates below." />
      <SecurityStep embedded />
      <ConfigureSection section="period" title="Historical period"
        custom={JSON.stringify(config.period) !== JSON.stringify(suggested)}
        summary={<p>{config.period.startDate} to {config.period.endDate}, including both dates. Only available trading days are used.</p>}>
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
  const totalFeesPct = (Object.values(config.execution.fees).reduce((sum, rate) => sum + rate, 0) * 100).toFixed(3);
  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader step={2} total={3} title="Describe your investing idea"
        description="Review when the simulation will buy and sell. These editable example rules are already filled in, so you can continue without configuring every option." />
      <AppNotice title="Example rules, not recommendations">
        The gain and loss thresholds below are starting points for learning how a simulation works. They are not advice about when to trade.
      </AppNotice>
      <ConfigureSection section="rules" title="Buy and sell rules"
        custom={JSON.stringify(config.rules) !== JSON.stringify(defaults.rules)}
        summary={<div className="flex flex-col gap-2">
          <p>{entryDescription(config.rules.buy.type, config.rules.buy.value)}.</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {config.rules.sells.map((sell) => <li key={sell.type}>{exitDescription(sell.type, sell.value)}.</li>)}
          </ul>
          <p>The first exit condition to trigger closes the position.</p>
        </div>}>
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
          hint={capitalError?.message || "Hypothetical money for this simulation. No real funds are used."}
          className="max-w-md" />
      </section>
      <ConfigureSection section="execution" title="Trade size and charges" actionLabel="trade settings"
        custom={JSON.stringify(config.execution) !== JSON.stringify(defaults.execution)}
        summary={<div className="flex flex-col gap-1">
          <p>{sizingDescription(config.execution.positionSizing.type, config.execution.positionSizing.value)}.</p>
          <p>Combined simulation charge: {totalFeesPct}% per buy or sell. Whole shares are rounded down.</p>
        </div>}>
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
      custom={JSON.stringify(config.metrics) !== JSON.stringify(defaults.metrics)}
      summary="Optional review preferences only. They do not change the simulation or which results the API returns.">
      <MetricsStep embedded />
    </ConfigureSection>
  );
}

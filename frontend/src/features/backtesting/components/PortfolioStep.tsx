import { RiMoneyDollarCircleLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { CAPITAL_PRESETS } from "../domain/defaults";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
  ParameterPanel,
} from "./BacktestStepLayout";

function sizingDescription(
  type: string,
  value: number | undefined,
): string {
  if (type === "percentage") return `${value ?? 50}% of portfolio equity`;
  if (type === "absolute") {
    return `LKR ${(value ?? 0).toLocaleString("en-LK")} per entry`;
  }
  if (type === "fixed_quantity") {
    return `${value ?? 0} whole shares per entry`;
  }
  return "all available simulated cash";
}

export function PortfolioStep() {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const capitalError = getStepErrors("portfolio").find(
    (error) => error.field === "startingCapital",
  );
  const startingCapital = config.portfolio.startingCapital;
  const totalFees =
    Object.values(config.execution.fees).reduce((sum, rate) => sum + rate, 0) *
    100;

  const updateCapital = (value: string | number) => {
    const next =
      typeof value === "number" ? value : Number.parseFloat(value);
    updateConfig((previous) => ({
      ...previous,
      portfolio: { ...previous.portfolio, startingCapital: next },
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        step={5}
        title="Set simulated starting capital"
        description="Starting capital is the hypothetical cash balance available on the first day. No real funds are deposited or traded."
      />

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Initial cash balance"
          description="The engine uses this amount for position sizing, fees, and the resulting equity curve."
        />
        <ParameterPanel>
          <div className="max-w-md">
            <Input
              type="number"
              label="Starting capital"
              leadingAddon={
                <span className="px-1 text-body-medium text-text-secondary">
                  LKR
                </span>
              }
              value={Number.isNaN(startingCapital) ? "" : String(startingCapital)}
              onChange={updateCapital}
              min={1}
              step={1000}
              isInvalid={Boolean(capitalError)}
              hint={capitalError?.message || "Minimum: LKR 1.00"}
              fieldClassName="ring-1 ring-inset ring-border-button-default"
            />
            <BacktestFieldError>{capitalError?.message}</BacktestFieldError>
          </div>
        </ParameterPanel>
      </section>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title="Quick amounts"
          description="These are shortcuts only; you can enter any valid positive amount above."
        />
        <div className="flex flex-wrap gap-2">
          {CAPITAL_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              variant={
                startingCapital === preset.value ? "primary" : "secondary"
              }
              size="small"
              onClick={() => updateCapital(preset.value)}
            >
              {preset.label.replace("Rs.", "LKR")}
            </Button>
          ))}
        </div>
      </section>

      <AppNotice title="How this amount is used">
        <div className="flex flex-col gap-1">
          <p>
            Each entry can use{" "}
            <strong>
              {sizingDescription(
                config.execution.positionSizing.type,
                config.execution.positionSizing.value,
              )}
            </strong>
            .
          </p>
          <p>
            The simulation deducts the configured {totalFees.toFixed(3)}%
            transaction rate and rounds quantities down to whole shares.
          </p>
        </div>
      </AppNotice>

      <div className="flex items-center gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4">
        <span className="flex rounded-xl bg-stat-card-icon-background p-2">
          <RiMoneyDollarCircleLine
            className="size-5 text-foreground-icon-primary"
            aria-hidden
          />
        </span>
        <div>
          <p className="text-caption-1-medium text-text-tertiary">
            Current hypothetical balance
          </p>
          <p className="text-title-2-medium tabular-nums text-text-primary">
            LKR{" "}
            {Number.isNaN(startingCapital)
              ? "—"
              : startingCapital.toLocaleString("en-LK")}
          </p>
        </div>
      </div>
    </div>
  );
}
